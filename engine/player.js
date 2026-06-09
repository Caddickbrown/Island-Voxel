// engine/player.js — Third-person player controller
import * as THREE from 'three';
import { VS, SEA_LEVEL } from './world.js';

const GRAVITY   = -28 * VS;
const JUMP_VEL  = 10  * VS;
const BASE_SPD  = 5   * VS;
const SPRINT    = 1.6;
const CAM_DIST  = 8   * VS;
const CAM_HI    = 3   * VS;
const P_RADIUS  = 0.4 * VS;
const P_HEIGHT  = 1.8 * VS;
const STEP_UP   = 1.5 * VS; // max step height in world units
const DAMP      = 0.12;     // camera follow damping

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

    // Visual — simple capsule placeholder (replaced with actual mesh later)
    this._mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(P_RADIUS, P_HEIGHT - P_RADIUS*2, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0xffd700 }),
    );
    body.position.y = P_HEIGHT * 0.5;
    this._mesh.add(body);
    renderer.scene.add(this._mesh);

    this._camTarget = new THREE.Vector3();

    // Interaction ray direction (set each frame)
    this._interactDir = new THREE.Vector3();
  }

  // Spawn at surface of a world position
  spawnAt(wx, wz) {
    const surfVox = this._world.getSurfaceY(Math.round(wx), Math.round(wz));
    this.position.set(wx * VS, (surfVox + 2) * VS, wz * VS);
    this.velocity.set(0, 0, 0);
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
    const { dx: ldx, dy: ldy } = input.consumeLook();
    this.yaw   -= ldx;
    this.pitch  = Math.max(-0.5, Math.min(0.8, this.pitch - ldy));

    // Movement direction (relative to yaw)
    const speed = BASE_SPD * (input.isDown('sprint') ? SPRINT : 1);
    const mx = input.moveX, mz = input.moveZ;
    const len = Math.sqrt(mx*mx + mz*mz);
    if (len > 0.01) {
      const nx = mx / len, nz = mz / len;
      this.velocity.x = (Math.sin(this.yaw)*nz + Math.cos(this.yaw)*nx) * speed;
      this.velocity.z = (Math.cos(this.yaw)*nz - Math.sin(this.yaw)*nx) * speed;
      this._mesh.rotation.y = -this.yaw + Math.atan2(mx, -mz);
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

    // Step up: if blocked horizontally but voxel above is clear, climb
    const footVox = Math.floor((this.position.y) / VS);
    const fwdVox  = { x: Math.round(this.position.x/VS + this.velocity.x*0.5), z: Math.round(this.position.z/VS + this.velocity.z*0.5) };
    if (this._world.isSolid(fwdVox.x, footVox, fwdVox.z) &&
        !this._world.isSolid(fwdVox.x, footVox+1, fwdVox.z) &&
        !this._world.isSolid(fwdVox.x, footVox+2, fwdVox.z)) {
      this.position.y += VS * 0.5;
    }

    this._resolveCollision();

    // Keep above sea
    const minY = SEA_LEVEL * VS + VS * 0.2;
    if (this.position.y < minY) { this.position.y = minY; this.velocity.y = 0; this.onGround = true; }

    // Update visual mesh
    this._mesh.position.copy(this.position);

    // Third-person camera
    const camX = this.position.x - Math.sin(this.yaw) * Math.cos(this.pitch) * CAM_DIST;
    let   camY = this.position.y + P_HEIGHT + CAM_HI + Math.sin(this.pitch) * CAM_DIST;
    const camZ = this.position.z - Math.cos(this.yaw) * Math.cos(this.pitch) * CAM_DIST;
    // Keep the camera above the terrain so it never clips into hills
    const camSurf = (this._world.getSurfaceY(Math.round(camX/VS), Math.round(camZ/VS)) + 1.5) * VS;
    if (camY < camSurf) camY = camSurf;
    this._camTarget.set(camX, camY, camZ);
    this._camera.position.lerp(this._camTarget, DAMP + dt * 3);
    this._camera.lookAt(
      this.position.x,
      this.position.y + P_HEIGHT * 0.7,
      this.position.z,
    );
  }
}
