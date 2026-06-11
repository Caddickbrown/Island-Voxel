// engine/character.js — Shared blocky-humanoid builder + animation for Player and NPCs
import * as THREE from 'three';
import { VS } from './world.js';

// ── Shared body materials (lazy singletons, no ??= for Safari compat) ────────
const _matCache = new Map();
export function mat(hex) {
  if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return _matCache.get(hex);
}

export function darken(hex, f) {
  const r=((hex>>16)&0xff)*f, g=((hex>>8)&0xff)*f, b=(hex&0xff)*f;
  return (Math.round(r)<<16)|(Math.round(g)<<8)|Math.round(b);
}

// Total height of the built humanoid (hair top), in world units
export const HUMANOID_HEIGHT = 2.425 * VS;

/**
 * Build a blocky humanoid with its origin at the feet, facing +Z.
 * Returns { group, parts } — parts holds the limbs used by animateHumanoid().
 */
export function buildHumanoid({
  skinTone   = 0xd4956a,
  hairColor  = 0x3d1a00,
  shirtColor = 0x3a90c8,
  pantsColor = null,
  castShadow = false,
} = {}) {
  const group = new THREE.Group();
  const skin  = mat(skinTone);
  const hair  = mat(hairColor);
  const shirt = mat(shirtColor);
  const pants = mat(pantsColor !== null ? pantsColor : darken(shirtColor, 0.65));
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
  // Feet — parented to the legs so they swing with the stride instead of
  // staying planted while the legs rotate (positions are leg-local)
  const footGeo = new THREE.BoxGeometry(.3*VS,.2*VS,.42*VS);
  const footL = new THREE.Mesh(footGeo, shoe); footL.position.set(0,-.38*VS,.07*VS);
  const footR = new THREE.Mesh(footGeo, shoe); footR.position.set(0,-.38*VS,.07*VS);
  legL.add(footL); legR.add(footR);

  const meshes = [head, hairM, body, armL, armR, legL, legR, footL, footR];
  if (castShadow) for (const m of meshes) m.castShadow = true;
  group.add(head, hairM, body, armL, armR, legL, legR);

  return { group, parts: { head, hair: hairM, body, armL, armR, legL, legR, footL, footR } };
}

const _ease = (k, dt) => 1 - Math.exp(-k * dt);
const _approach = (mesh, target, f) => { mesh.rotation.x += (target - mesh.rotation.x) * f; };

// Move torso/head/hair up or down together from their rest heights
function _setBob(parts, anim, y) {
  parts.body.position.y = anim.baseBodyY + y;
  parts.head.position.y = anim.baseHeadY + y;
  parts.hair.position.y = anim.baseHairY + y;
}

/**
 * Per-frame limb animation. `anim` is caller-owned mutable state:
 * { walkPhase: number }. speed is horizontal world units/s.
 */
export function animateHumanoid(parts, anim, dt, { speed = 0, grounded = true } = {}) {
  if (anim.baseBodyY === undefined) {
    anim.baseBodyY = parts.body.position.y;
    anim.baseHeadY = parts.head.position.y;
    anim.baseHairY = parts.hair.position.y;
    anim.idleTime  = Math.random() * Math.PI * 2; // desync crowds
  }
  if (!grounded) {
    // Airborne — arms swept back, legs split in a leap. Kept modest because the
    // limb boxes pivot at their centres, so big angles clip through the body.
    const f = _ease(10, dt);
    _approach(parts.armL, -0.9, f);
    _approach(parts.armR, -0.9, f);
    _approach(parts.legL,  0.45, f);
    _approach(parts.legR, -0.25, f);
    _setBob(parts, anim, 0);
    return;
  }
  if (speed > 0.05) {
    // Walk cycle — swing rate follows movement speed (NPC pace: 7 at 2.8*VS)
    anim.walkPhase += dt * Math.max(4, (speed / VS) * 2.5);
    const swing = Math.sin(anim.walkPhase) * 0.55;
    parts.armL.rotation.x =  swing;
    parts.armR.rotation.x = -swing;
    parts.legL.rotation.x = -swing * 0.8;
    parts.legR.rotation.x =  swing * 0.8;
    // Torso bob — one dip per footfall (twice per stride), plus a slight lean
    _setBob(parts, anim, Math.abs(Math.sin(anim.walkPhase)) * 0.05 * VS);
    _approach(parts.body, 0.06, _ease(8, dt));
  } else {
    // Settle back to rest, then breathe — slow torso rise with a hint of
    // arm sway so standing characters never look frozen
    anim.idleTime += dt;
    const f = _ease(12, dt);
    const breathe = Math.sin(anim.idleTime * 1.7);
    _approach(parts.armL, breathe * 0.04, f);
    _approach(parts.armR, breathe * 0.04, f);
    _approach(parts.legL, 0, f);
    _approach(parts.legR, 0, f);
    _approach(parts.body, 0, f);
    _setBob(parts, anim, breathe * 0.012 * VS);
  }
}
