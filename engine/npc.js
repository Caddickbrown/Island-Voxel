// engine/npc.js — NPC class with schedule-driven movement, labels, dialogue
// Ported and adapted from Island's npcs.js
import * as THREE from 'three';
import { VS } from './world.js';

// ─── Simulated clock ─────────────────────────────────────────────────────────
const SIM_SPEED   = 6;   // 1 real second = 6 sim minutes
const START_HOUR  = 8;
let   _simAccum   = 0;

export function tickSimTime(dt) { _simAccum += dt * SIM_SPEED / 60; }
export function getSimTime()    { return (START_HOUR + _simAccum) % 24; }
export function setSimTime(h)   { _simAccum = (h - START_HOUR + 24) % 24 * 60 / SIM_SPEED; }

function getScheduleEntry(schedule, hour) {
  for (const [start, end, area, activity] of schedule) {
    if (start < end ? (hour >= start && hour < end) : (hour >= start || hour < end))
      return { area, activity };
  }
  return { area: schedule[0][2], activity: schedule[0][3] };
}

// ── Shared body materials (lazy singletons, no ??= for Safari compat) ────────
const _matCache = new Map();
function mat(hex) {
  if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return _matCache.get(hex);
}

// Convenience shortcuts (called as M.white() etc)
const M = {
  white:  () => mat(0xf5f5f5),
  cream:  () => mat(0xf0e8d0),
  tan:    () => mat(0xc8a070),
  brown:  () => mat(0x7a4e18),
  grey:   () => mat(0x888888),
  red:    () => mat(0xd03020),
  blue:   () => mat(0x3a90c8),
  yellow: () => mat(0xf0c000),
  black:  () => mat(0x222222),
};
const LABEL_DIST = 16; // VS units — show label within this distance

export class NPC {
  /**
   * @param {Object} def  - { name, job, color, skinTone, hairColor, schedule }
   * @param {Object} areas - AREAS map: key → { x, z, label } in logical coords
   * @param {World}  world
   * @param {THREE.Scene} scene
   */
  constructor(def, areas, world, scene) {
    this.name     = def.name;
    this.job      = def.job;
    this.schedule = def.schedule;
    this._areas   = areas;
    this._world   = world;

    // Build voxel → world-pos helper
    this._areaPositions = {}; // area key → THREE.Vector3

    // ── Mesh (blocky humanoid) ───────────────────────────────────────────────
    this.group = new THREE.Group();
    const skin  = mat(def.skinTone !== undefined ? def.skinTone : 0xd4956a);
    const hair  = mat(def.hairColor !== undefined ? def.hairColor : 0x3d1a00);
    const shirt = mat(def.color);
    const pants = mat(this._darken(def.color, 0.65));
    const shoe  = mat(0x2a1a0a);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(.7*VS,.7*VS,.7*VS), skin);
    head.position.y = 1.9*VS;
    // Hair (top slab)
    const hairM = new THREE.Mesh(new THREE.BoxGeometry(.75*VS,.25*VS,.75*VS), hair);
    hairM.position.y = 2.3*VS;
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(.7*VS,.9*VS,.4*VS), shirt);
    body.position.y = 1.15*VS;
    // Arms
    const armGeo = new THREE.BoxGeometry(.28*VS,.8*VS,.28*VS);
    const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(-.52*VS,1.15*VS,0);
    const armR = new THREE.Mesh(armGeo, shirt); armR.position.set( .52*VS,1.15*VS,0);
    // Legs
    const legGeo = new THREE.BoxGeometry(.3*VS,.85*VS,.3*VS);
    const legL = new THREE.Mesh(legGeo, pants); legL.position.set(-.2*VS,.48*VS,0);
    const legR = new THREE.Mesh(legGeo, pants); legR.position.set( .2*VS,.48*VS,0);
    // Feet
    const footGeo = new THREE.BoxGeometry(.3*VS,.2*VS,.42*VS);
    const footL = new THREE.Mesh(footGeo, shoe); footL.position.set(-.2*VS,.1*VS,.07*VS);
    const footR = new THREE.Mesh(footGeo, shoe); footR.position.set( .2*VS,.1*VS,.07*VS);

    this.group.add(head, hairM, body, armL, armR, legL, legR, footL, footR);
    this._armL = armL; this._armR = armR;
    this._legL = legL; this._legR = legR;

    // Label (canvas sprite)
    this._label = this._makeLabel();
    this._label.position.y = 2.8*VS;
    this._label.visible = false;
    this.group.add(this._label);

    // Add job accessory
    this._addAccessory(def.job, skin);

    scene.add(this.group);

    // State
    this._targetPos   = null; // THREE.Vector3 world-space target
    this._currentArea = null;
    this._isMoving    = false;
    this._walkPhase   = Math.random() * Math.PI * 2;
    this._idleTimer   = 0;
    this._dialogueIdx = 0;
    this._labelActivity = null; // last activity drawn on the label
  }

  _darken(hex, f) {
    const r=((hex>>16)&0xff)*f, g=((hex>>8)&0xff)*f, b=(hex&0xff)*f;
    return (Math.round(r)<<16)|(Math.round(g)<<8)|Math.round(b);
  }

  _makeLabel() {
    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 72;
    const ctx     = canvas.getContext('2d');
    this._labelCanvas = canvas;
    this._labelCtx    = ctx;
    this._drawLabel(this.name, this.job, '');

    const tex = new THREE.CanvasTexture(canvas);
    this._labelTex = tex;
    const mat2 = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat2);
    sprite.scale.set(2.2*VS, 0.6*VS, 1);
    return sprite;
  }

  _drawLabel(name, job, activity) {
    const ctx = this._labelCtx, w = 256, h = 72;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.fill();
    ctx.font = 'bold 16px Georgia'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(`${name}`, w/2, 22);
    ctx.font = '13px Georgia'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(job, w/2, 42);
    if (activity) { ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,200,0.8)'; ctx.fillText(activity, w/2, 62); }
    // _labelTex doesn't exist yet on the initial draw from _makeLabel; the
    // CanvasTexture created right after picks up the canvas content itself.
    if (this._labelTex) this._labelTex.needsUpdate = true;
  }

  _addAccessory(job, skin) {
    let acc = null;
    switch(job) {
      case 'Baker':      acc = new THREE.Mesh(new THREE.CylinderGeometry(.22*VS,.3*VS,.4*VS,8), mat(0xffffff)); acc.position.y=2.6*VS; break;
      case 'Postman':    acc = new THREE.Mesh(new THREE.BoxGeometry(.5*VS,.2*VS,.5*VS), mat(0xcc1111));         acc.position.y=2.5*VS; break;
      case 'Farmer':     acc = new THREE.Mesh(new THREE.CylinderGeometry(.4*VS,.4*VS,.15*VS,8), mat(0x8b6914)); acc.position.y=2.55*VS; break;
      case 'Fisherman':  acc = new THREE.Mesh(new THREE.BoxGeometry(.4*VS,.15*VS,.4*VS), mat(0x334466));        acc.position.y=2.5*VS; break;
      case 'Botanist':   acc = new THREE.Mesh(new THREE.BoxGeometry(.12*VS,.6*VS,.12*VS), mat(0x3a6e3a));       acc.position.set(.55*VS,1.4*VS,.15*VS); break;
      case 'Engineer':   acc = new THREE.Mesh(new THREE.BoxGeometry(.8*VS,.2*VS,.6*VS), mat(0xf0a000));         acc.position.y=2.5*VS; break;
      case 'Keeper':     acc = new THREE.Mesh(new THREE.CylinderGeometry(.25*VS,.28*VS,.3*VS,8), mat(0x334466)); acc.position.y=2.55*VS; break;
    }
    if (acc) this.group.add(acc);
  }

  // Set the AREAS position cache (called after world is generated)
  setAreaPositions(areaPositions) {
    this._areaPositions = areaPositions;
  }

  // Move NPC to a named area
  goToArea(areaKey) {
    const pos = this._areaPositions[areaKey.toLowerCase()];
    if (!pos) return;
    this._targetPos   = pos.clone();
    this._isMoving    = true;
    this._currentArea = areaKey;
  }

  update(dt, now, playerPos, hour) {
    if (hour === undefined) hour = getSimTime();
    const entry = getScheduleEntry(this.schedule, hour);

    // Update schedule destination
    if (entry.area !== this._currentArea) {
      this.goToArea(entry.area);
    }

    // Walk toward target
    if (this._isMoving && this._targetPos) {
      const dx = this._targetPos.x - this.group.position.x;
      const dz = this._targetPos.z - this.group.position.z;
      const dist = Math.sqrt(dx*dx+dz*dz);

      if (dist > 0.8*VS) {
        const speed = 2.8 * VS;
        this.group.position.x += (dx/dist) * speed * dt;
        this.group.position.z += (dz/dist) * speed * dt;
        this.group.rotation.y = Math.atan2(dx, dz);

        // Walking animation
        this._walkPhase += dt * 7;
        const swing = Math.sin(this._walkPhase) * 0.55;
        this._armL.rotation.x =  swing;
        this._armR.rotation.x = -swing;
        this._legL.rotation.x = -swing * 0.8;
        this._legR.rotation.x =  swing * 0.8;

        // Snap Y to terrain
        const gx = Math.round(this.group.position.x/VS);
        const gz = Math.round(this.group.position.z/VS);
        const sy = this._world.getSurfaceY(gx, gz);
        this.group.position.y = sy * VS + 0.05;
      } else {
        this._isMoving = false;
        this._armL.rotation.x = 0; this._armR.rotation.x = 0;
        this._legL.rotation.x = 0; this._legR.rotation.x = 0;
        // Idle: gentle sway
        this._idleTimer += dt;
        const sway = Math.sin(this._idleTimer * 0.8 + this._walkPhase) * 0.04;
        this.group.rotation.y += sway * dt;
      }
    } else {
      this._idleTimer += dt;
    }

    // Label visibility — show when player is close
    if (playerPos) {
      const pdx = this.group.position.x - playerPos.x;
      const pdz = this.group.position.z - playerPos.z;
      const maxD = LABEL_DIST * VS;
      this._label.visible = pdx*pdx + pdz*pdz < maxD*maxD;
      // Redraw the canvas + re-upload the texture only when the text changes
      if (this._label.visible && entry.activity !== this._labelActivity) {
        this._labelActivity = entry.activity;
        this._drawLabel(this.name, this.job, entry.activity);
      }
    }
  }

  // Returns dialogue for this NPC
  getDialogue(dialogueBank) {
    const lines = dialogueBank[this.name] || dialogueBank[this.job] || ['Hello!'];
    const line = lines[this._dialogueIdx % lines.length];
    this._dialogueIdx++;
    return { name: this.name, job: this.job, line };
  }

  destroy() {
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

// ─── NPC Manager ─────────────────────────────────────────────────────────────
export class NPCManager {
  constructor(scene, world, areas) {
    this.npcs   = [];
    this._scene = scene;
    this._world = world;
    this._areas = areas;

    // Build area → world position map
    this._areaPositions = {};
    // Will be populated after world generation via setAreaPositions()
  }

  setAreaPositions(posMap) {
    this._areaPositions = posMap;
    for (const npc of this.npcs) npc.setAreaPositions(posMap);
  }

  spawn(def) {
    const npc = new NPC(def, this._areas, this._world, this._scene);
    npc.setAreaPositions(this._areaPositions);
    // Place at starting area
    const entry = npc.schedule[0];
    const startKey = entry ? entry[2] : null;
    const startPos = this._areaPositions[startKey];
    if (startPos) {
      npc.group.position.copy(startPos);
    } else {
      // Default to town square
      npc.group.position.set(0, 0, 0);
    }
    this.npcs.push(npc);
    return npc;
  }

  // hour (optional, 0–24): drive schedules from the day/night clock so NPC
  // routines and the HUD clock agree; falls back to the internal sim clock.
  update(dt, now, playerPos, hour) {
    if (hour === undefined) { tickSimTime(dt); hour = getSimTime(); }
    for (const npc of this.npcs) npc.update(dt, now, playerPos, hour);
  }

  // Get nearest NPC within interaction range
  getNearby(playerPos, range = 4.5 * VS) {
    let closest = null, closestDist = range;
    for (const npc of this.npcs) {
      const dx = npc.group.position.x - playerPos.x;
      const dz = npc.group.position.z - playerPos.z;
      const d  = Math.sqrt(dx*dx+dz*dz);
      if (d < closestDist) { closestDist = d; closest = npc; }
    }
    return closest;
  }
}
