// engine/renderer.js — Three.js scene manager with chunk mesh lifecycle
import * as THREE from 'three';
import { VS } from './world.js';

const LANTERN_POOL = 6; // fixed light count → shaders compile once, never again

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.004);

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 600);

    // Materials
    this.solidMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, metalness: 0.02,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.04, metalness: 0.12,
      transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });

    // Lighting
    this.sun = new THREE.DirectionalLight(0xfff5e0, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0004;
    const sc = 80;
    Object.assign(this.sun.shadow.camera, { left:-sc, right:sc, top:sc, bottom:-sc });
    this.scene.add(this.sun);
    this.scene.add(this.sun.target); // target must be in the scene for shadows to track it

    this.ambient = new THREE.AmbientLight(0x8ab4d4, 0.5);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a7c2f, 0.4);
    this.scene.add(this.hemi);

    // Sky dome
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(580, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(this.sky);

    // Stars
    const sg = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 2000; i++) {
      const a = Math.random()*Math.PI*2, b = Math.random()*Math.PI*.5;
      sp.push(560*Math.cos(b)*Math.cos(a), 560*Math.sin(b), 560*Math.cos(b)*Math.sin(a));
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.2, transparent: true, opacity: 0,
    }));
    this.stars.visible = false;
    this.scene.add(this.stars);

    // Lanterns: positions are stored as spots; a small pool of PointLights is
    // assigned to the nearest spots at night. One light per lantern would put
    // dozens of point lights in every shader (and can exceed mobile uniform
    // limits) — a fixed pool keeps the light count constant.
    this.lanternSpots = [];
    this._lanternPool = [];
    for (let i = 0; i < LANTERN_POOL; i++) {
      const pl = new THREE.PointLight(0xffaa44, 0, 18, 2);
      this.scene.add(pl);
      this._lanternPool.push(pl);
    }
    this._lanternFocus = new THREE.Vector3(Infinity, 0, Infinity);

    // Chunk meshes: key → { opaque: THREE.Mesh, glass: THREE.Mesh, lod }
    this.chunkMeshes = new Map();

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  // Build a THREE.BufferGeometry from packed typed arrays (positions in voxel coords)
  _makeGeo({ positions, normals, colors, indices }) {
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    // Scale positions by VS
    const scaled = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i++) scaled[i] = positions[i] * VS;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(scaled, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
    geo.computeBoundingSphere(); // three.js frustum-culls per mesh using this
    return geo;
  }

  addChunkMesh(key, { opaque, glass }, lod) {
    this.removeChunkMesh(key); // clean up old
    const entry = { lod };

    const oGeo = this._makeGeo(opaque);
    if (oGeo) {
      const m = new THREE.Mesh(oGeo, this.solidMat);
      m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false; // chunk meshes never move
      this.scene.add(m);
      entry.opaque = m;
    }
    const gGeo = this._makeGeo(glass);
    if (gGeo) {
      const m = new THREE.Mesh(gGeo, this.glassMat);
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      entry.glass = m;
    }
    this.chunkMeshes.set(key, entry);
  }

  removeChunkMesh(key) {
    const entry = this.chunkMeshes.get(key);
    if (!entry) return;
    for (const mesh of [entry.opaque, entry.glass]) {
      if (mesh) { mesh.geometry.dispose(); this.scene.remove(mesh); }
    }
    this.chunkMeshes.delete(key);
  }

  addLanternLight(wx, wy, wz) {
    this.lanternSpots.push(new THREE.Vector3(wx * VS, wy * VS, wz * VS));
  }

  // Assign the pooled lights to the nearest lantern spots around `focus`.
  updateLanterns(focus, intensity) {
    if (intensity <= 0.01) {
      for (const pl of this._lanternPool) pl.intensity = 0;
      return;
    }
    // Re-pick nearest spots only when the player has moved a few units
    if (focus.distanceToSquared(this._lanternFocus) > 9) {
      this._lanternFocus.copy(focus);
      const sorted = this.lanternSpots
        .map(p => ({ p, d: p.distanceToSquared(focus) }))
        .sort((a,b) => a.d - b.d);
      for (let i = 0; i < this._lanternPool.length; i++) {
        if (sorted[i]) this._lanternPool[i].position.copy(sorted[i].p);
      }
    }
    for (const pl of this._lanternPool) pl.intensity = intensity;
  }

  setSun(pos, color, intensity, focus) {
    this.sun.position.copy(pos);
    this.sun.color.set(color);
    this.sun.intensity = intensity;
    if (focus) this.sun.target.position.copy(focus); // keep shadows centred on the player
  }

  setAmbient(intensity) {
    this.ambient.intensity = intensity;
    this.hemi.intensity = intensity * 0.6;
  }

  setFog(color, density) {
    this.scene.fog.color.set(color);
    this.scene.fog.density = density;
    this.renderer.setClearColor(color);
    this.sky.material.color.set(color);
  }

  render() {
    // Sky dome and stars follow the camera so they never get clipped/parallaxed
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
