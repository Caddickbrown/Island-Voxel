// engine/entities.js — Entity manager and wildlife
import * as THREE from 'three';
import { VS, SEA_LEVEL } from './world.js';

export class Entity {
  constructor(scene) {
    this.mesh = new THREE.Group();
    scene.add(this.mesh);
    this.alive = true;
  }
  update(_dt, _now) {}
  destroy() { this.alive = false; if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
}

export class EntityManager {
  constructor() { this.entities = []; }
  add(e) { this.entities.push(e); return e; }
  remove(e) { e.destroy(); this.entities = this.entities.filter(x => x !== e); }
  update(dt, now) { for (const e of this.entities) if (e.alive) e.update(dt, now); }
}

// ── Shared materials (explicit cache, Safari-compatible) ─────────────────────
const _mc = new Map();
function mat(hex) {
  if (!_mc.has(hex)) _mc.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return _mc.get(hex);
}
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
const B = (w,h,d,m) => new THREE.Mesh(new THREE.BoxGeometry(w*VS,h*VS,d*VS), m());

// Trot cycle for four-legged wildlife — diagonal leg pairs swing in
// opposition; rate 0 eases the legs back to rest. Caller owns _walkPhase.
function animateQuadruped(legs, ent, dt, rate, amp) {
  if (rate > 0) {
    ent._walkPhase += dt * rate;
    const s = Math.sin(ent._walkPhase) * amp;
    legs[0].rotation.x = s; legs[3].rotation.x = s;
    legs[1].rotation.x = -s; legs[2].rotation.x = -s;
  } else {
    const f = 1 - Math.exp(-10 * dt);
    for (const leg of legs) leg.rotation.x += (0 - leg.rotation.x) * f;
  }
}

// Ease the mesh onto the terrain surface instead of snapping a full voxel
// at column boundaries (teleport-snaps if somehow far off, e.g. first frame)
function followGround(ent, world, dt, lift) {
  const gx = Math.round(ent.mesh.position.x / VS), gz = Math.round(ent.mesh.position.z / VS);
  const ty = world.getSurfaceY(gx, gz) * VS + lift;
  const cy = ent.mesh.position.y;
  ent.mesh.position.y = Math.abs(ty - cy) > 2 * VS ? ty : cy + (ty - cy) * (1 - Math.exp(-10 * dt));
}

// ── Seagull ──────────────────────────────────────────────────────────────────
export class Seagull extends Entity {
  constructor(scene, wx, wy, wz) {
    super(scene);
    const body=B(.4,.22,.9,M.white); this.mesh.add(body);
    const head=B(.28,.22,.3,M.white); head.position.set(0,.1*VS,.55*VS); this.mesh.add(head);
    const beak=B(.1,.08,.22,M.yellow); beak.position.set(0,.04*VS,.77*VS); this.mesh.add(beak);
    this.wL=B(2.4,.06,.5,M.white); this.wL.position.set(-1.3*VS,.05*VS,0); this.mesh.add(this.wL);
    this.wR=B(2.4,.06,.5,M.white); this.wR.position.set(1.3*VS,.05*VS,0); this.mesh.add(this.wR);
    const tL=B(.5,.06,.4,M.black); tL.position.set(-2.2*VS,.05*VS,.1*VS); this.mesh.add(tL);
    const tR=B(.5,.06,.4,M.black); tR.position.set( 2.2*VS,.05*VS,.1*VS); this.mesh.add(tR);
    this._cx=wx*VS; this._cy=wy*VS; this._cz=wz*VS;
    this._ang=Math.random()*Math.PI*2;
    this._rad=(14+Math.random()*18)*VS;
    this._spd=(.35+Math.random()*.25)*(Math.random()<.5?1:-1);
    this._ap=Math.random()*Math.PI*2; this._fp=Math.random()*Math.PI*2;
  }
  update(_dt, now) {
    const a=this._ang+now*.001*this._spd;
    this.mesh.position.set(
      this._cx+Math.cos(a)*this._rad,
      this._cy+Math.sin(now*.0007+this._ap)*4*VS,
      this._cz+Math.sin(a)*this._rad,
    );
    this.mesh.rotation.y=-a-Math.PI*.5*Math.sign(this._spd);
    const fl=Math.sin(now*.006+this._fp)*.45;
    this.wL.rotation.z=fl; this.wR.rotation.z=-fl;
  }
}

// ── Sheep ────────────────────────────────────────────────────────────────────
export class Sheep extends Entity {
  constructor(scene, world, wx, wz) {
    super(scene);
    this._world=world; this._homeX=wx; this._homeZ=wz;
    const body=B(1.6,.9,2.2,M.white); body.position.y=.85*VS; this.mesh.add(body);
    for(const[bx,bz]of[[0,.5],[.4,0],[-.4,0],[0,-.5]]){const b=B(.7,.5,.7,M.cream);b.position.set(bx*VS,1.4*VS,bz*VS);this.mesh.add(b);}
    this.head=B(.5,.55,.6,M.tan); this.head.position.set(0,1.1*VS,1.3*VS); this.mesh.add(this.head);
    this.mesh.add(B(.3,.3,.3,M.tan)); // snout stub
    this._legs=[];
    for(const[lx,,lz]of[[-.55,0,-.7],[.55,0,-.7],[-.55,0,.7],[.55,0,.7]]){const leg=B(.3,.7,.3,M.tan);leg.position.set(lx*VS,.35*VS,lz*VS);this.mesh.add(leg);this._legs.push(leg);}
    this._tx=wx; this._tz=wz; this._timer=2+Math.random()*4;
    this._walkPhase=Math.random()*Math.PI*2;
    const sy=world.getSurfaceY(Math.round(wx),Math.round(wz));
    this.mesh.position.set(wx*VS,(sy+.1)*VS,wz*VS);
  }
  update(dt, now) {
    this._timer-=dt;
    if(this._timer<=0){ this._tx=this._homeX+(Math.random()-.5)*24; this._tz=this._homeZ+(Math.random()-.5)*24; this._timer=2+Math.random()*4; }
    const dx=this._tx*VS-this.mesh.position.x;
    const dz=this._tz*VS-this.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist>.8*VS){
      this.mesh.position.x+=dx/dist*1.2*VS*dt;
      this.mesh.position.z+=dz/dist*1.2*VS*dt;
      this.mesh.rotation.y=Math.atan2(dx,dz);
      animateQuadruped(this._legs,this,dt,9,.4);
    } else {
      this.head.rotation.x=Math.sin(now*.0015)*.3;
      animateQuadruped(this._legs,this,dt,0,0);
    }
    followGround(this,this._world,dt,.1);
  }
}

// ── Deer ─────────────────────────────────────────────────────────────────────
export class Deer extends Entity {
  constructor(scene, world, wx, wz) {
    super(scene);
    this._world=world; this._homeX=wx; this._homeZ=wz;
    const body=B(.9,1,2,M.tan); body.position.y=1.1*VS; this.mesh.add(body);
    const neck=B(.35,.8,.4,M.tan); neck.position.set(0,1.9*VS,.85*VS); neck.rotation.x=-.3; this.mesh.add(neck);
    this.hG=new THREE.Group(); this.hG.position.set(0,2.3*VS,1.15*VS);
    this.hG.add(B(.45,.5,.65,M.tan));
    for(const[dx,,dz]of[[-.28,0,-.05],[.28,0,-.05]]){const a=B(.08,.7,.08,M.brown);a.position.set(dx*VS,.7*VS,dz*VS);this.hG.add(a);}
    this.mesh.add(this.hG);
    this._legs=[];
    for(const[lx,,lz]of[[-.35,0,-.7],[.35,0,-.7],[-.35,0,.7],[.35,0,.7]]){const leg=B(.28,1,.28,M.tan);leg.position.set(lx*VS,.5*VS,lz*VS);this.mesh.add(leg);this._legs.push(leg);}
    this._tx=wx; this._tz=wz; this._wt=3+Math.random()*8;
    this._walkPhase=Math.random()*Math.PI*2;
    const sy=world.getSurfaceY(Math.round(wx),Math.round(wz));
    this.mesh.position.set(wx*VS,(sy+.1)*VS,wz*VS);
  }
  update(dt, now) {
    this._wt-=dt;
    if(this._wt<=0){this._tx=this._homeX+(Math.random()-.5)*34;this._tz=this._homeZ+(Math.random()-.5)*34;this._wt=4+Math.random()*10;}
    const dx=this._tx*VS-this.mesh.position.x;
    const dz=this._tz*VS-this.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist>VS){
      this.mesh.position.x+=dx/dist*1.8*VS*dt;
      this.mesh.position.z+=dz/dist*1.8*VS*dt;
      this.mesh.rotation.y=Math.atan2(dx,dz);
      animateQuadruped(this._legs,this,dt,7,.45);
    } else {
      this.hG.rotation.x=Math.sin(now*.0012)*.35;
      animateQuadruped(this._legs,this,dt,0,0);
    }
    followGround(this,this._world,dt,.1);
  }
}

// ── Whale ────────────────────────────────────────────────────────────────────
export class Whale extends Entity {
  constructor(scene, worldCX, worldCZ, seaLevelVS) {
    super(scene);
    const g=this.mesh;
    g.add(B(3,2.5,10,M.blue),B(2.6,2.2,4,M.blue),B(.5,2.5,2.5,M.blue),B(2.4,2.2,9,M.white));
    this.tail=B(1.8,1.5,3,M.blue); this.tail.position.set(0,1.5*VS,-7*VS); g.add(this.tail);
    this._cx=worldCX*VS; this._cz=worldCZ*VS; this._sea=seaLevelVS; this._a=0;
  }
  update(dt, now) {
    this._a+=dt*.055;
    const yo=Math.sin(this._a*2.5)*2.5*VS, dive=Math.sin(this._a*.7);
    this.mesh.position.set(this._cx+Math.cos(this._a)*70*VS,this._sea-2*VS+yo+(dive<-.6?dive*8*VS:0),this._cz+Math.sin(this._a)*70*VS*.6);
    this.mesh.rotation.y=-this._a-Math.PI*.5;
    this.mesh.rotation.x=dive<-.5?-.4:Math.sin(now*.0008)*.08;
    this.tail.rotation.x=Math.sin(now*.004)*.4;
  }
}

// ── Boat ─────────────────────────────────────────────────────────────────────
export class Boat extends Entity {
  constructor(scene, wx, wz, hullHex, hasMast, seaLevelVS) {
    super(scene);
    const hM=new THREE.MeshLambertMaterial({color:hullHex});
    this.mesh.add(new THREE.Mesh(new THREE.BoxGeometry(2.2*VS,1.2*VS,5.5*VS),hM));
    this.mesh.add(B(2,.25,5,M.cream),B(1.4,1.2,2.2,M.white));
    if(hasMast){this.mesh.add(B(.15,5.5,.15,M.brown),B(.08,2.8,2.2,M.white));}
    this.mesh.position.set(wx*VS, seaLevelVS-.4*VS, wz*VS);
    this._sea=seaLevelVS; this._ph=Math.random()*Math.PI*2;
  }
  update(_dt, now) {
    this.mesh.position.y=this._sea-.4*VS+Math.sin(now*.0009+this._ph)*.18*VS;
    this.mesh.rotation.z=Math.sin(now*.0007+this._ph)*.03;
  }
}
