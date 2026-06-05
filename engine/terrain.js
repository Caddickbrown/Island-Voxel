// engine/terrain.js — Heightmap + biome generator (self-contained Perlin noise)

const _P = new Uint8Array(512);
let _init = false;
function initNoise() {
  if (_init) return; _init = true;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0xf1234fa7;
  for (let i = 255; i > 0; i--) {
    s=(s^s<<13)>>>0; s=(s^s>>7)>>>0; s=(s^s<<17)>>>0;
    const j=s%(i+1); [p[i],p[j]]=[p[j],p[i]];
  }
  for (let i=0;i<256;i++) _P[i]=_P[i+256]=p[i];
}
const _f = t => t*t*t*(t*(t*6-15)+10);
function vn(x,z) {
  initNoise();
  const X=Math.floor(x)&255, Z=Math.floor(z)&255;
  const fx=x-Math.floor(x), fz=z-Math.floor(z);
  const u=_f(fx), v=_f(fz), a=_P[X]+Z, b=_P[X+1]+Z;
  return((_P[a]&255)/255*(1-u)*(1-v)+(_P[b]&255)/255*u*(1-v)+
         (_P[a+1]&255)/255*(1-u)*v+(_P[b+1]&255)/255*u*v)*2-1;
}
export function fbm(x,z,o=5) {
  let v=0,a=.5,f=1,m=0;
  for(let i=0;i<o;i++){v+=vn(x*f,z*f)*a;m+=a;a*=.5;f*=1.97;}
  return v/m;
}

/**
 * islandHeight(wx, wz, S) → float height above sea in voxels.
 * wx/wz are voxel offsets from world centre.
 * S = feature scale (default 4).
 */
export function islandHeight(wx, wz, S=4) {
  const d=Math.sqrt(wx*wx+wz*wz), a=Math.atan2(wz,wx);
  const r=S*62+S*14*Math.sin(a*3+.22)+S*8*Math.sin(a*7+1.38)
          +S*4*Math.sin(a*11-.82)+S*2*Math.sin(a*17+2.1)+S*Math.sin(a*23-1.4);
  const ef=Math.max(0,1-d/r); if(ef<=0) return 0;
  const fade=Math.min(1,ef*5), fs=1/S;

  // Flat base — max ~S*3
  let h=S*1.5*fade;
  h+=fbm(wx*fs*.08+1.1,wz*fs*.08+3.3,4)*S*2.5*fade;
  h+=fbm(wx*fs*.2+5,   wz*fs*.2+2,   3)*S*1.0*fade;
  h=Math.max(h, fade>.3 ? S*Math.min(1,(fade-.3)*3) : 0);

  // Single mountain NW
  const md=Math.sqrt((wx+S*42)**2+(wz+S*55)**2);
  if(md<S*38){
    const mf=Math.max(0,1-md/(S*38));
    h+=S*55*mf**1.3+fbm(wx*fs*.28+8.4,wz*fs*.28+2.6,4)*S*6*mf;
  }

  // Dock spit S
  const dd=Math.sqrt(wx*wx+(wz-S*62)**2);
  if(dd<S*12) h=Math.max(h*(dd/(S*12)),S*1.5*Math.max(0,1-dd/(S*12)));

  // Town flattened
  const td=Math.sqrt(wx*wx+wz*wz);
  if(td<S*22) h=h*(td/(S*22))+S*2*(1-td/(S*22));

  return Math.max(0,h);
}

/** getBiome(wx, wz, height, S) → string */
export function getBiome(wx,wz,height,S=4) {
  if(height<=0)       return 'ocean';
  if(height<S*2.4)    return 'beach';
  if(height<S*3)      return 'pebble';
  const md=Math.sqrt((wx+S*42)**2+(wz+S*55)**2);
  if(md<S*38){
    if(height>S*50)   return 'snow';
    if(height>S*38)   return 'mountain';
    if(height>S*20)   return 'highland';
  }
  const a=Math.atan2(wz,wx);
  if(a>-0.6&&a<1.4&&height>S*2.4) return 'forest';
  return 'meadow';
}

/** getSurfaceVoxel(biome, depth) → voxel type string */
export function getSurfaceVoxel(biome,depth) {
  if(biome==='ocean')    return 'DEEP_WATER';
  if(biome==='beach')    return depth<=3?'SAND':'STONE';
  if(biome==='pebble')   return depth===0?'PEBBLE':depth<=3?'SAND':'STONE';
  if(biome==='snow')     return depth<=2?'SNOW':'STONE';
  if(biome==='mountain') return 'STONE';
  if(biome==='highland') return depth===0?'STONE':depth<=2?'DIRT':'STONE';
  if(biome==='forest')   return depth===0?(Math.sin(depth*17.3)>.3?'GRASS_DARK':'GRASS'):depth<=3?'DIRT':'STONE';
  return depth===0?'GRASS':depth<=3?'DIRT':'STONE';
}
