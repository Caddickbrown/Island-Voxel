// engine/input.js — Unified keyboard/mouse/touch/gamepad input
export class Input {
  constructor(canvas) {
    this._canvas = canvas;
    // Movement axes (-1..1)
    this.moveX = 0; this.moveZ = 0;
    // Look deltas (consumed per frame)
    this._ldx = 0; this._ldy = 0;
    // Action states
    this._down        = new Set();
    this._pressed     = new Set(); // readable for one frame via wasPressed()
    // Events fire between animation frames, so presses are buffered here and
    // promoted to _pressed at the start of the next update() — writing them
    // straight into _pressed would get cleared before anyone could read them.
    this._pressedNext = new Set();
    this._gpDown      = new Set(); // actions currently held via gamepad buttons
    this.pointerLocked = false;
    this.mouseSensitivity = 0.0025;
    // Invert the look Y axis (applies to mouse, touch drag and gamepad alike)
    this.invertY = false;

    // Virtual joystick state
    this._vjActive = false;
    this._vjId = null;
    this._vjOrigin = { x: 0, y: 0 };
    this._vjCurrent = { x: 0, y: 0 };
    this._lookDragId = null;
    this._lookPrev = { x: 0, y: 0 };

    this._bindKeyboard();
    this._bindMouse(canvas);
    this._bindTouch(canvas);
    this._buildVJCanvas();
  }

  _bindKeyboard() {
    const map = { KeyW:'forward', KeyS:'back', KeyA:'left', KeyD:'right',
      ArrowUp:'forward', ArrowDown:'back', ArrowLeft:'left', ArrowRight:'right',
      Space:'jump', KeyE:'interact', Escape:'pause', Tab:'map', ShiftLeft:'sprint', ShiftRight:'sprint' };

    window.addEventListener('keydown', e => {
      const a = map[e.code];
      if (a) { if(!this._down.has(a)) this._pressedNext.add(a); this._down.add(a); }
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      const a = map[e.code]; if (a) this._down.delete(a);
    });
  }

  _bindMouse(canvas) {
    // requestPointerLock can reject (e.g. Chrome's cooldown right after an
    // Esc-exit) — swallow it, the next click will lock
    canvas.addEventListener('click', () => { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', e => {
      if (!this.pointerLocked) return;
      this._ldx += e.movementX * this.mouseSensitivity;
      this._ldy += e.movementY * this.mouseSensitivity;
    });
  }

  _bindTouch(canvas) {
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.5 && !this._vjActive) {
          this._vjActive = true; this._vjId = t.identifier;
          this._vjOrigin = { x: t.clientX, y: t.clientY };
          this._vjCurrent = { x: t.clientX, y: t.clientY };
        } else if (t.clientX >= innerWidth * 0.5 && this._lookDragId === null) {
          this._lookDragId = t.identifier;
          this._lookPrev = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._vjId) {
          this._vjCurrent = { x: t.clientX, y: t.clientY };
        } else if (t.identifier === this._lookDragId) {
          this._ldx += (t.clientX - this._lookPrev.x) * this.mouseSensitivity * 1.8;
          this._ldy += (t.clientY - this._lookPrev.y) * this.mouseSensitivity * 1.8;
          this._lookPrev = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    const endTouch = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._vjId) {
          this._vjActive = false; this._vjId = null;
          this._vjCurrent = this._vjOrigin;
        } else if (t.identifier === this._lookDragId) {
          this._lookDragId = null;
        }
      }
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  }

  _buildVJCanvas() {
    // Lightweight canvas overlay for the virtual joystick (not DOM divs)
    const vc = document.createElement('canvas');
    vc.style.cssText = 'position:fixed;left:0;bottom:0;pointer-events:none;opacity:0.45;z-index:50;';
    vc.width = 160; vc.height = 160;
    document.body.appendChild(vc);
    this._vjCanvas = vc;
    this._vjCtx = vc.getContext('2d');
  }

  _drawVJ() {
    if (!this._vjActive && !this._vjWasActive) return; // nothing to draw or clear
    this._vjWasActive = this._vjActive;
    const ctx = this._vjCtx, c = this._vjCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this._vjActive) return;
    const cx = 80, cy = 80;
    // Base ring
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.stroke();
    // Thumb
    const dx = Math.min(40, Math.max(-40, this._vjCurrent.x - this._vjOrigin.x));
    const dy = Math.min(40, Math.max(-40, this._vjCurrent.y - this._vjOrigin.y));
    ctx.beginPath(); ctx.arc(cx+dx, cy+dy, 22, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  }

  update() {
    this._pressed.clear();
    for (const a of this._pressedNext) this._pressed.add(a);
    this._pressedNext.clear();

    // Keyboard movement
    let kx = 0, kz = 0;
    if (this._down.has('left'))    kx -= 1;
    if (this._down.has('right'))   kx += 1;
    if (this._down.has('forward')) kz -= 1;
    if (this._down.has('back'))    kz += 1;

    // Virtual joystick movement
    let jx = 0, jz = 0;
    if (this._vjActive) {
      const dx = (this._vjCurrent.x - this._vjOrigin.x) / 40;
      const dy = (this._vjCurrent.y - this._vjOrigin.y) / 40;
      jx = Math.max(-1, Math.min(1, dx));
      jz = Math.max(-1, Math.min(1, dy));
    }

    // Gamepad
    let gpx = 0, gpz = 0, gplx = 0, gply = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      gpx = gp.axes[0]; gpz = gp.axes[1];
      gplx = gp.axes[2]; gply = gp.axes[3];
      // Standard mapping: A jump, X interact, Start pause, L3 sprint.
      // Edge-tracked in _gpDown so releasing a pad button never clears an
      // action a held keyboard key is also driving.
      for (const [idx, action] of [[0,'jump'], [2,'interact'], [9,'pause'], [10,'sprint']]) {
        const held = !!(gp.buttons[idx] && gp.buttons[idx].pressed);
        if (held && !this._gpDown.has(action)) {
          this._gpDown.add(action);
          if (!this._down.has(action)) this._pressed.add(action);
          this._down.add(action);
        } else if (!held && this._gpDown.has(action)) {
          this._gpDown.delete(action);
          this._down.delete(action);
        }
      }
      break;
    }
    if (Math.abs(gplx) > 0.1) this._ldx += gplx * 0.04;
    if (Math.abs(gply) > 0.1) this._ldy += gply * 0.04;

    this.moveX = Math.max(-1, Math.min(1, kx + jx + (Math.abs(gpx) > 0.1 ? gpx : 0)));
    this.moveZ = Math.max(-1, Math.min(1, kz + jz + (Math.abs(gpz) > 0.1 ? gpz : 0)));

    this._drawVJ();
  }

  consumeLook() {
    const dx = this._ldx, dy = this._ldy * (this.invertY ? -1 : 1);
    this._ldx = 0; this._ldy = 0;
    return { dx, dy };
  }

  // Trigger an action from external UI (e.g. the on-screen interact button)
  press(action)     { this._pressedNext.add(action); }

  isDown(action)    { return this._down.has(action); }
  wasPressed(action){ return this._pressed.has(action); }
}
