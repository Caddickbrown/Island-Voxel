// engine/water.js — GPU shader water (zero CPU vertex updates)
import * as THREE from 'three';
import { VS } from './world.js';

const VERT = /* glsl */`
uniform float time;
uniform float vs;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vec3 pos = position;
  float wx = pos.x * 0.18;
  float wz = pos.z * 0.14;
  float wave =
      sin(wx + time * 1.1)  * 0.32 +
      sin(wz + time * 0.75) * 0.26 +
      sin((wx + wz) * 0.9 + time) * 0.14;
  pos.y += wave * vs;

  // Approximate normal from finite differences
  float eps = 0.5;
  float wx2 = (pos.x + eps) * 0.18, wz2 = pos.z * 0.14;
  float dydx = (sin(wx2+time*1.1)*0.32+sin(wz2+time*0.75)*0.26+sin((wx2+wz2)*0.9+time)*0.14)
             - (sin(wx +time*1.1)*0.32+sin(wz +time*0.75)*0.26+sin((wx +wz )*0.9+time)*0.14);
  float wx3 = pos.x * 0.18, wz3 = (pos.z + eps) * 0.14;
  float dydz = (sin(wx3+time*1.1)*0.32+sin(wz3+time*0.75)*0.26+sin((wx3+wz3)*0.9+time)*0.14)
             - (sin(wx3+time*1.1)*0.32+sin(wz +time*0.75)*0.26+sin((wx3+wz )*0.9+time)*0.14);

  vNormal = normalize(vec3(-dydx * vs, 1.0, -dydz * vs));
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */`
uniform vec3 waterColor;
uniform vec3 sunDir;
uniform float opacity;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vec3 n = normalize(vNormal);
  // Diffuse
  float diff = max(dot(n, normalize(sunDir)), 0.0);
  // Fresnel (simple schlick)
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  // Specular
  vec3 h = normalize(normalize(sunDir) + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 64.0) * 0.6;

  vec3 col = waterColor * (0.5 + diff * 0.5);
  col = mix(col, vec3(0.85, 0.92, 1.0), fresnel * 0.3);
  col += vec3(spec);

  gl_FragColor = vec4(col, opacity);
}
`;

export class Water {
  constructor(scene, worldVoxelSize, seaLevel, vs = VS) {
    this._time = 0;

    const geo = new THREE.PlaneGeometry(
      worldVoxelSize * vs * 4,
      worldVoxelSize * vs * 4,
      80, 80,
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time:       { value: 0 },
        vs:         { value: vs },
        waterColor: { value: new THREE.Color(0x2a8ab5) },
        sunDir:     { value: new THREE.Vector3(0.5, 1, 0.3) },
        opacity:    { value: 0.88 },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, seaLevel * vs, 0);
    scene.add(this.mesh);
  }

  update(dt) {
    this._time += dt;
    this.material.uniforms.time.value = this._time;
  }

  setSunDirection(x, y, z) {
    this.material.uniforms.sunDir.value.set(x, y, z).normalize();
  }

  setColor(hex) {
    this.material.uniforms.waterColor.value.set(hex);
  }

  setCenter(wx, wz) {
    this.mesh.position.x = wx;
    this.mesh.position.z = wz;
  }
}
