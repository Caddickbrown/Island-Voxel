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
  // Feet
  const footGeo = new THREE.BoxGeometry(.3*VS,.2*VS,.42*VS);
  const footL = new THREE.Mesh(footGeo, shoe); footL.position.set(-.2*VS,.1*VS,.07*VS);
  const footR = new THREE.Mesh(footGeo, shoe); footR.position.set( .2*VS,.1*VS,.07*VS);

  const meshes = [head, hairM, body, armL, armR, legL, legR, footL, footR];
  if (castShadow) for (const m of meshes) m.castShadow = true;
  group.add(...meshes);

  return { group, parts: { head, hair: hairM, body, armL, armR, legL, legR, footL, footR } };
}

const _ease = (k, dt) => 1 - Math.exp(-k * dt);
const _approach = (mesh, target, f) => { mesh.rotation.x += (target - mesh.rotation.x) * f; };

/**
 * Per-frame limb animation. `anim` is caller-owned mutable state:
 * { walkPhase: number, bob: number }. speed is horizontal world units/s.
 */
export function animateHumanoid(parts, anim, dt, { speed = 0, grounded = true } = {}) {
  if (!grounded) {
    // Airborne — arms swept back, legs split in a leap. Kept modest because the
    // limb boxes pivot at their centres, so big angles clip through the body.
    const f = _ease(10, dt);
    _approach(parts.armL, -0.9, f);
    _approach(parts.armR, -0.9, f);
    _approach(parts.legL,  0.45, f);
    _approach(parts.legR, -0.25, f);
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
  } else {
    // Settle back to rest
    const f = _ease(12, dt);
    _approach(parts.armL, 0, f);
    _approach(parts.armR, 0, f);
    _approach(parts.legL, 0, f);
    _approach(parts.legR, 0, f);
  }
}
