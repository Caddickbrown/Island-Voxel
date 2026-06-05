// engine/daynight.js — Sky, lighting, day/night cycle
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
const DAY_LENGTH = 170; // real seconds per full day

export class DayNight {
  constructor(renderer, water, worldCentreX = 0, worldCentreZ = 0) {
    this._r   = renderer;
    this._w   = water;
    this._cx  = worldCentreX;
    this._cz  = worldCentreZ;
    this.gameTime = 0.28; // start at morning
    this._tc = new THREE.Color();
    this._td = new THREE.Color();
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
    const sky  = this._tc.set(k0[1]).lerp(this._td.set(k1[1]), f).clone();
    const sunC = this._tc.set(k0[2]).lerp(this._td.set(k1[2]), f).clone();
    return {
      sky, sunC,
      sunI: k0[3] + (k1[3] - k0[3]) * f,
      ambI: k0[4] + (k1[4] - k0[4]) * f,
    };
  }

  setTime(t) { this.gameTime = ((t % 1) + 1) % 1; }

  update(dt) {
    this.gameTime = (this.gameTime + dt / DAY_LENGTH) % 1;
    const t = this.gameTime;
    const { sky, sunC, sunI, ambI } = this._eval(t);

    // Sun orbit
    const a = t * Math.PI * 2 - Math.PI * 0.5;
    const sunPos = new THREE.Vector3(
      this._cx + Math.cos(a) * 350,
      Math.sin(a) * 300,
      this._cz + Math.sin(a) * 140,
    );
    this._r.setSun(sunPos, sunC, sunI);
    this._r.setAmbient(ambI);
    this._r.setFog(sky, 0.004);

    // Water colour tracks sky
    if (this._w) {
      this._tc.set(0x2a8ab5).lerp(sky, 0.2);
      this._w.setColor(this._tc.getHex());
      this._w.setSunDirection(sunPos.x - this._cx, sunPos.y, sunPos.z - this._cz);
    }

    // Stars
    this._r.stars.material.opacity = Math.max(0, this.nightness) * 0.85;

    // Lantern lights
    const li = Math.max(0, this.nightness) * 14;
    for (const lp of this._r.lanternLights) lp.intensity = li;

    // Clock
    const h = Math.floor(t * 24), m = Math.floor((t * 24 - h) * 60);
    const el = document.getElementById('time');
    if (el) el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
}
