// engine/player.js — Third-person player controller
import * as THREE from 'three';
import { VS, SEA_LEVEL } from './world.js';
import { buildHumanoid, animateHumanoid, mat, HUMANOID_HEIGHT } from './character.js';

const GRAVITY   = -28 * VS;
const JUMP_VEL  = 10  * VS;
const BASE_SPD  = 5   * VS;
const SPRINT    = 1.6;
const CAM_DIST  = 8   * VS;
const CAM_HI    = 3   * VS;
const P_RADIUS  = 0.4 * VS;
const P_HEIGHT  = 1.8 * VS;
const STEP_UP   = 1.5 * VS; // max step height in world units

export class Player {
  constructor(world, renderer, input) {
    this._world   = world;
    this._camera  = renderer.camera;
    this._input   = input;
    this._scene   = renderer.scene;

    // Position in world units (VS-scaled)
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw   = 0;
    this.pitch = 0.3;
    this.onGround = false;

    // Visual — blocky humanoid (shared builder with NPCs), scaled so the
    // silhouette matches the physics capsule height
    this._mesh = new THREE.Group();
    const { group: bodyGroup, parts } = buildHumanoid({
      shirtColor: 0x2a9d8f,   // teal — distinct from every NPC outfit
      hairColor:  0x4a2c12,
      castShadow: true,
    });
    // Satchel across the back — child of the torso so it bobs and leans with it
    const satchel = new THREE.Mesh(new THREE.BoxGeometry(.5*VS,.55*VS,.18*VS), mat(0x7a4e18));
    satchel.position.set(0, -.05*VS, -.31*VS);
    satchel.castShadow = true;
    parts.body.add(satchel);
    bodyGroup.scale.setScalar(P_HEIGHT / HUMANOID_HEIGHT);
    this._mesh.add(bodyGroup);
    renderer.scene.add(this._mesh);
    this._parts = parts;
    this._anim  = { walkPhase: 0 };
    // Rendered Y is smoothed separately so voxel-quantized physics steps
    // don't pop the mesh or the camera
    this._visualY = 0;

    this._camTarget = new THREE.Vector3();

    // Interaction ray direction (set each frame)
    this._interactDir = new THREE.Vector3();
  }

  // Spawn at surface of a world position
  spawnAt(wx, wz) {
    const surfVox = this._world.getSurfaceY(Math.round(wx), Math.round(wz));
    this.position.set(wx * VS, (surfVox + 2) * VS, wz * VS);
    this.velocity.set(0, 0, 0);
    this._visualY = this.position.y;
  }

  // Returns the voxel coord the player is looking at (for interaction)
  interactionRay() {
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const eyePos = this.position.clone().addScaledVector(new THREE.Vector3(0,1,0), P_HEIGHT*0.9);
    const target = eyePos.addScaledVector(dir, 2.5 * VS);
    return {
      x: Math.round(target.x / VS),
      y: Math.round(target.y / VS),
      z: Math.round(target.z / VS),
    };
  }

  _isSolid(wx, wy, wz) {
    return this._world.isSolid(Math.floor(wx), Math.floor(wy), Math.floor(wz));
  }

  // World-Y of the walkable ground top at (wx, wz): scan from STEP_UP above the
  // foot down a few voxels for the first solid voxel with two clear voxels
  // above it, so canopies and awnings overhead never count as ground.
  _groundY(wx, wz) {
    const vx = Math.floor(wx / VS), vz = Math.floor(wz / VS);
    const footVy = Math.floor(this.position.y / VS);
    const maxUp = Math.ceil(STEP_UP / VS);
    for (let vy = footVy + maxUp; vy >= footVy - 3; vy--) {
      if (this._world.isSolid(vx, vy, vz) &&
          !this._world.isSolid(vx, vy + 1, vz) &&
          !this._world.isSolid(vx, vy + 2, vz)) {
        return (vy + 1) * VS;
      }
    }
    return null;
  }

  // Sweep-cast sphere collision — push out of solid voxels
  _resolveCollision() {
    const p = this.position;
    const r = P_RADIUS, h = P_HEIGHT;
    // Check foot, mid, head spheres
    for (const yOff of [r, h * 0.5, h - r]) {
      const cx = p.x / VS, cy = (p.y + yOff) / VS, cz = p.z / VS;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const vx = Math.floor(cx) + dx, vy = Math.floor(cy) + dy, vz = Math.floor(cz) + dz;
        if (!this._world.isSolid(vx, vy, vz)) continue;
        // AABB of voxel vs sphere of player
        const bminX = vx*VS, bminY = vy*VS, bminZ = vz*VS;
        const bmaxX = bminX+VS, bmaxY = bminY+VS, bmaxZ = bminZ+VS;
        const sx = Math.max(bminX, Math.min(p.x, bmaxX));
        const sy = Math.max(bminY, Math.min(p.y+yOff, bmaxY));
        const sz = Math.max(bminZ, Math.min(p.z, bmaxZ));
        const dist = Math.sqrt((p.x-sx)**2+(p.y+yOff-sy)**2+(p.z-sz)**2);
        if (dist < r && dist > 0.0001) {
          const nx=(p.x-sx)/dist, ny=(p.y+yOff-sy)/dist, nz=(p.z-sz)/dist;
          const pen = r - dist;
          p.x += nx*pen; p.y += ny*pen; p.z += nz*pen;
          if (ny > 0.7) { this.velocity.y = 0; this.onGround = true; }
          else if (ny < -0.7) this.velocity.y = 0;
          else { this.velocity.x *= 0.1; this.velocity.z *= 0.1; }
        }
      }
    }
  }

  update(dt) {
    const input = this._input;
    // Standard (non-inverted) look: pushing up looks up, i.e. lowers the orbit
    // camera. Input negates dy when the user enables "invert Y" in the menu.
    const { dx: ldx, dy: ldy } = input.consumeLook();
    this.yaw   -= ldx;
    this.pitch  = Math.max(-0.5, Math.min(0.8, this.pitch + ldy));

    const wasGrounded = this.onGround;

    // Movement — camera-relative. The camera looks along +(sin yaw, cos yaw),
    // so screen-right is (-cos yaw, sin yaw); nz is -1 when pushing forward.
    const speed = BASE_SPD * (input.isDown('sprint') ? SPRINT : 1);
    const mx = input.moveX, mz = input.moveZ;
    const len = Math.sqrt(mx*mx + mz*mz);
    if (len > 0.01) {
      const nx = mx / len, nz = mz / len;
      const fx = Math.sin(this.yaw),  fz = Math.cos(this.yaw);
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      this.velocity.x = (fx * -nz + rx * nx) * speed;
      this.velocity.z = (fz * -nz + rz * nx) * speed;
      // Face the direction of travel (shortest arc, frame-rate independent)
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      let dYaw = targetYaw - this._mesh.rotation.y;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      this._mesh.rotation.y += dYaw * (1 - Math.exp(-12 * dt));
    } else {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }

    // Jump
    if (input.wasPressed('jump') && this.onGround) {
      this.velocity.y = JUMP_VEL;
      this.onGround = false;
    }

    // Gravity
    if (!this.onGround) this.velocity.y += GRAVITY * dt;
    else this.velocity.y = Math.max(0, this.velocity.y);

    // Integrate
    this.onGround = false;
    this.position.addScaledVector(this.velocity, dt);

    // Ground-follow & step: while grounded, snap to the local voxel-top within
    // STEP_UP. Sampling slightly ahead of the body lifts the player over a step
    // before the wall collision can block it; the centre column handles walking
    // down so descending stays grounded instead of free-falling each voxel.
    if (wasGrounded && this.velocity.y <= 0) {
      let gy = this._groundY(this.position.x, this.position.z);
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (hSpeed > 0.01) {
        const look = P_RADIUS + VS * 0.3;
        const ga = this._groundY(this.position.x + this.velocity.x / hSpeed * look,
                                 this.position.z + this.velocity.z / hSpeed * look);
        if (ga !== null && ga > this.position.y && ga - this.position.y <= STEP_UP) gy = ga;
      }
      if (gy !== null && Math.abs(gy - this.position.y) <= STEP_UP) {
        this.position.y = gy;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }

    this._resolveCollision();

    // Keep above sea
    const minY = SEA_LEVEL * VS + VS * 0.2;
    if (this.position.y < minY) { this.position.y = minY; this.velocity.y = 0; this.onGround = true; }

    // Update visual mesh — Y smoothed so snapped physics steps don't pop
    this._visualY += (this.position.y - this._visualY) * (1 - Math.exp(-14 * dt));
    if (Math.abs(this.position.y - this._visualY) > STEP_UP * 2) this._visualY = this.position.y;
    this._mesh.position.set(this.position.x, this._visualY, this.position.z);

    // Walk / idle / airborne animation
    animateHumanoid(this._parts, this._anim, dt, {
      speed:    Math.hypot(this.velocity.x, this.velocity.z),
      grounded: this.onGround,
    });

    // Third-person camera (follows the smoothed Y)
    const camX = this.position.x - Math.sin(this.yaw) * Math.cos(this.pitch) * CAM_DIST;
    let   camY = this._visualY + P_HEIGHT + CAM_HI + Math.sin(this.pitch) * CAM_DIST;
    const camZ = this.position.z - Math.cos(this.yaw) * Math.cos(this.pitch) * CAM_DIST;
    // Keep the camera above the terrain so it never clips into hills
    const camSurf = (this._world.getSurfaceY(Math.round(camX/VS), Math.round(camZ/VS)) + 1.5) * VS;
    if (camY < camSurf) camY = camSurf;
    this._camTarget.set(camX, camY, camZ);
    this._camera.position.lerp(this._camTarget, 1 - Math.exp(-8 * dt));
    this._camera.lookAt(
      this.position.x,
      this._visualY + P_HEIGHT * 0.7,
      this.position.z,
    );
  }
}
