// engine/daynight.js — Sky, lighting, day/night cycle, clouds
import * as THREE from 'three';

const KEYS = [
  [0.00, 0x030c1a, 0x101840, 0.05, 0.08],
  [0.18, 0xd4602a, 0xff9028, 0.85, 0.30],
  [0.28, 0x87ceeb, 0xfff5e0, 2.50, 0.52],
  [0.50, 0x60aadc, 0xfffce0, 2.90, 0.60],
  [0.72, 0x87ceeb, 0xfff5e0, 2.50, 0.55],
  [0.82, 0xd06030, 0xff6822, 0.95, 0.36],
  [0.92, 0x181830, 0x2030a0, 0.18, 0.13],
  [1.00, 0x030c1a, 0x101840, 0.05, 0.08],
];
const DAY_LENGTH = 360; // real seconds per full day

export class DayNight {
  constructor(renderer, water, worldCentreX = 0, worldCentreZ = 0) {
    this._r   = renderer;
    this._w   = water;
    this._cx  = worldCentreX;
    this._cz  = worldCentreZ;
    this.gameTime = 0.28; // start at morning
    this._tc = new THREE.Color();
    this._td = new THREE.Color();
    this._skyCol = new THREE.Color();
    this._sunCol = new THREE.Color();
    this._waterCol = new THREE.Color();
    this._sunPos = new THREE.Vector3();
    this._timeEl = null;
    this._lastClock = '';

    this._buildClouds(renderer.scene, worldCentreX, worldCentreZ);
  }

  _buildClouds(scene, cx, cz) {
    this._clouds = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.82, fog: false,
    });
    for (let i = 0; i < 12; i++) {
      const cluster = new THREE.Group();
      const puffs = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffs; p++) {
        const w = 10 + Math.random() * 16, d = 7 + Math.random() * 10;
        const puff = new THREE.Mesh(new THREE.BoxGeometry(w, 2 + Math.random() * 2, d), mat);
        puff.position.set((Math.random() - .5) * 16, (Math.random() - .5) * 2, (Math.random() - .5) * 10);
        cluster.add(puff);
      }
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 220;
      cluster.position.set(cx + Math.cos(a) * r, 70 + Math.random() * 30, cz + Math.sin(a) * r);
      cluster.userData.speed = 0.8 + Math.random() * 1.2;
      this._clouds.add(cluster);
    }
    this._cloudMat = mat;
    scene.add(this._clouds);
  }

  get nightness() {
    const t = this.gameTime;
    if (t > 0.9) return 1 + (0.9 - t) * 10;
    if (t < 0.18) return 1 - t / 0.18;
    return 0;
  }

  _eval(t) {
    let i = 0;
    while (i < KEYS.length - 1 && KEYS[i+1][0] < t) i++;
    const k0 = KEYS[i], k1 = KEYS[i+1];
    const f = (t - k0[0]) / (k1[0] - k0[0]);
    this._skyCol.set(k0[1]).lerp(this._td.set(k1[1]), f);
    this._sunCol.set(k0[2]).lerp(this._td.set(k1[2]), f);
    return {
      sky: this._skyCol, sunC: this._sunCol,
      sunI: k0[3] + (k1[3] - k0[3]) * f,
      ambI: k0[4] + (k1[4] - k0[4]) * f,
    };
  }

  setTime(t) { this.gameTime = ((t % 1) + 1) % 1; }

  // focus: player position (world units) — keeps shadows and lanterns centred
  update(dt, focus) {
    this.gameTime = (this.gameTime + dt / DAY_LENGTH) % 1;
    const t = this.gameTime;
    const { sky, sunC, sunI, ambI } = this._eval(t);

    // Sun orbit around the focus point
    const fx = focus ? focus.x : this._cx;
    const fy = focus ? focus.y : 0;
    const fz = focus ? focus.z : this._cz;
    const a = t * Math.PI * 2 - Math.PI * 0.5;
    this._sunPos.set(
      fx + Math.cos(a) * 350,
      fy + Math.sin(a) * 300,
      fz + Math.sin(a) * 140,
    );
    this._r.setSun(this._sunPos, sunC, sunI, focus);
    this._r.setAmbient(ambI);
    this._r.setFog(sky, 0.004);

    // Water colour tracks sky
    if (this._w) {
      this._waterCol.set(0x2a8ab5).lerp(sky, 0.2);
      this._w.setColor(this._waterCol);
      this._w.setSunDirection(this._sunPos.x - fx, this._sunPos.y - fy, this._sunPos.z - fz);
    }

    // Stars — skip drawing 2000 points entirely during the day
    const night = Math.max(0, this.nightness);
    this._r.stars.material.opacity = night * 0.85;
    this._r.stars.visible = night > 0.02;

    // Lantern lights (pooled, nearest to player)
    if (focus) this._r.updateLanterns(focus, night * 14);

    // Clouds drift slowly and fade at night; each cluster wraps around alone
    // so the whole sky never visibly jumps at once
    for (const cluster of this._clouds.children) {
      cluster.position.x += dt * cluster.userData.speed;
      if (cluster.position.x > this._cx + 320) cluster.position.x = this._cx - 320;
    }
    this._cloudMat.opacity = 0.82 * (1 - night * 0.75);

    // Clock — only touch the DOM when the displayed minute changes
    const h = Math.floor(t * 24), m = Math.floor((t * 24 - h) * 60);
    const clock = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    if (clock !== this._lastClock) {
      this._lastClock = clock;
      if (!this._timeEl) this._timeEl = document.getElementById('time');
      if (this._timeEl) this._timeEl.textContent = clock;
    }
  }
}
