// engine/terrain.js — Heightmap + zone system matching full Island spec
// Scene.js coords ÷ 5 → logical units (island radius ~62)

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

// ─── Landmark centres (logical units, pre-scale) ───────────────────────────
const MOUNTAIN_X = -46, MOUNTAIN_Z = -52; // NW
const TOWN_X = 0,       TOWN_Z = 0;

function dist2(ax,az,bx,bz){ return Math.sqrt((ax-bx)**2+(az-bz)**2); }

/**
 * getZone(lwx, lwz) — returns zone string for a logical-coordinate position.
 * Called from getBiome and islandHeight for zone-specific behaviour.
 */
export function getZone(lwx, lwz) {
  const d    = dist2(lwx, lwz, 0, 0);
  const a    = Math.atan2(lwz, lwx);
  const mDist = dist2(lwx, lwz, MOUNTAIN_X, MOUNTAIN_Z);

  // ── Mountain & summit ────────────────────────────────────────────────────
  if (mDist < 10) return 'summit';
  if (mDist < 28) return 'mountain';

  // ── Highland forest (NW, between mountain and plains) ───────────────────
  if (a > -2.4 && a < -0.8 && d > 28 && d < 55 && mDist > 28) return 'highland_forest';

  // ── Wind ridge (N, slightly elevated) ───────────────────────────────────
  if (a > -1.5 && a < -0.6 && d > 30 && d < 52) return 'wind_ridge';

  // ── Clifftops (NW coast) ─────────────────────────────────────────────────
  if (a > -2.8 && a < -1.4 && d > 44 && d < 68) return 'clifftops';

  // ── Town core ────────────────────────────────────────────────────────────
  if (d < 20) return 'town';

  // ── Village (N of town) ──────────────────────────────────────────────────
  if (a > -1.2 && a < 0.3 && d > 14 && d < 32) return 'village';

  // ── Market town (SW of centre) ───────────────────────────────────────────
  if (a > 2.0 && a < 3.0 && d > 20 && d < 45) return 'market_town';

  // ── The Commons (E of town) ──────────────────────────────────────────────
  if (a > -0.3 && a < 0.6 && d > 8 && d < 28) return 'the_commons';

  // ── Forest (NE quadrant) ─────────────────────────────────────────────────
  if (a > -0.4 && a < 1.6 && d > 16 && d < 68) return 'forest';

  // ── River valley (E, flowing S — roughly 30–70 east) ────────────────────
  if (a > 0.2 && a < 1.0 && d > 20 && d < 55) return 'river_valley';

  // ── Community farm (far W) ───────────────────────────────────────────────
  if (a > 2.4 || a < -2.8 && d > 38 && d < 62) return 'community_farm';

  // ── Plains/farm (W–SW) ───────────────────────────────────────────────────
  if ((a > 1.6 || a < -2.0) && d > 14 && d < 55) return 'plains';

  // ── Orchard (W, between farm and coast) ─────────────────────────────────
  if (a > 2.2 && a < 2.8 && d > 44 && d < 60) return 'orchard';

  // ── Harbour/dock (S) ─────────────────────────────────────────────────────
  if (a > 1.1 && a < 2.1 && d > 50) return 'harbour';

  // ── Fishing village (SE) ─────────────────────────────────────────────────
  if (a > 1.0 && a < 1.6 && d > 50) return 'fishing_village';

  // ── Salt marsh (W coast, wetland) ────────────────────────────────────────
  if ((a > 2.6 || a < -2.6) && d > 46) return 'salt_marsh';

  // ── Kelp cove (SW coast) ─────────────────────────────────────────────────
  if (a > 2.0 && a < 2.8 && d > 54) return 'kelp_cove';

  // ── Tidepools (SW coast, rocky) ──────────────────────────────────────────
  if (a > 1.8 && a < 2.4 && d > 52) return 'tidepools';

  // ── Sandy bay (SE coast) ─────────────────────────────────────────────────
  if (a > 0.6 && a < 1.1 && d > 54) return 'sandy_bay';

  // ── Hidden beach (E coast) ───────────────────────────────────────────────
  if (a > -0.2 && a < 0.4 && d > 56) return 'hidden_beach';

  // ── Coast (outer ring fallback) ──────────────────────────────────────────
  if (d > 50) return 'coast';

  return 'plains'; // fallback
}

/**
 * islandHeight(wx, wz, S) — height in voxels above sea.
 * wx/wz are voxel offsets from world centre.
 */
export function islandHeight(wx, wz, S=4) {
  const lwx=wx/S, lwz=wz/S;
  const d=dist2(lwx,lwz,0,0), a=Math.atan2(lwz,lwx);
  const fs = 1/S;

  // ── Mountain (NW headland) ────────────────────────────────────────────────
  // Checked BEFORE the coastline falloff: the mountain centre sits beyond the
  // coast radius at this angle, so testing ef first sank the whole massif
  // (and 'The Summit') into the sea. Peak capped so summit (sea level 36 +
  // cone + roughness) stays below the world ceiling of 192 voxels — the old
  // S*52 cone clipped flat at the top.
  const mDist = dist2(lwx,lwz,MOUNTAIN_X,MOUNTAIN_Z);
  let mountainH = null, mBlend = 1;
  if (mDist < 30) {
    const mf = Math.max(0, 1-mDist/30);
    const cone  = S*33 * mf**1.4;
    const rough = fbm(wx*fs*.3+8.4,wz*fs*.3+2.6,4) * S*5 * mf;
    const feet  = S*5  * mf**0.4;
    mountainH = Math.max(feet, cone+rough);
    if (mDist < 26) return mountainH;
    mBlend = (30 - mDist) / 4; // outer rim: blend into surrounding terrain
  }

  // Organic coastline
  const r = 62 + 14*Math.sin(a*3+.22) + 8*Math.sin(a*7+1.38)
              +  4*Math.sin(a*11-.82) + 2*Math.sin(a*17+2.1) + Math.sin(a*23-1.4);
  const ef = Math.max(0, 1-d/r);
  if (ef<=0) return mountainH !== null ? Math.max(0, mountainH * mBlend) : 0;
  const fade = Math.min(1, ef*5);
  const zone = getZone(lwx, lwz);

  // ── Zone height profiles ──────────────────────────────────────────────────
  let h;

  switch(zone) {
    case 'town':
    case 'village':
    case 'market_town':
    case 'the_commons':
      h = S*2 + fbm(wx*fs*.15+0.5,wz*fs*.15+0.5,3)*S*0.4;
      h *= fade;
      break;

    case 'plains':
    case 'community_farm':
    case 'orchard':
      h = S*2*fade + fbm(wx*fs*.07+1.1,wz*fs*.07+3.3,4)*S*2*fade;
      h += fbm(wx*fs*.18+5,wz*fs*.18+2,3)*S*0.8*fade;
      h = Math.max(h, S*1.5*fade);
      break;

    case 'forest':
    case 'river_valley':
      h = S*2.5*fade + fbm(wx*fs*.09+2.2,wz*fs*.09+4.1,4)*S*2.5*fade;
      h += fbm(wx*fs*.22+6,wz*fs*.22+1.8,3)*S*1.2*fade;
      h = Math.max(h, S*1.8*fade);
      break;

    case 'highland_forest':
      h = S*5*fade + fbm(wx*fs*.1+3,wz*fs*.1+1,4)*S*3.5*fade;
      h = Math.max(h, S*4*fade);
      break;

    case 'wind_ridge':
      h = S*6*fade + fbm(wx*fs*.12+4,wz*fs*.12+2,3)*S*3*fade;
      h = Math.max(h, S*4.5*fade);
      break;

    case 'clifftops':
      h = S*8*fade + fbm(wx*fs*.14+5,wz*fs*.14+7,4)*S*4*fade;
      h = Math.max(h, S*6*fade);
      break;

    case 'salt_marsh':
    case 'kelp_cove':
    case 'harbour':
    case 'fishing_village':
      h = S*1.2*fade + fbm(wx*fs*.12+3,wz*fs*.12+1,3)*S*1*fade;
      break;

    case 'tidepools':
      h = S*1.5*fade + fbm(wx*fs*.18+7,wz*fs*.18+3,3)*S*2*fade;
      const tRock = fbm(wx*fs*.3+12,wz*fs*.3+8,2);
      if (tRock>0.3) h += S*3*(tRock-0.3)*2.5*fade;
      break;

    case 'sandy_bay':
    case 'hidden_beach':
      h = S*1.2*fade + fbm(wx*fs*.1+2,wz*fs*.1+5,3)*S*0.8*fade;
      break;

    case 'coast':
    default:
      h = S*1.3*fade + fbm(wx*fs*.12+3.3,wz*fs*.12+1.1,3)*S*1.5*fade;
      const headland = fbm(wx*fs*.25+9,wz*fs*.25+6,2);
      if (headland>0.35) h += S*3*(headland-0.35)*2.5*fade;
      break;
  }

  // Dock spit flat
  const dd = dist2(lwx,lwz,0,62);
  if (dd<12) h = Math.max(h*(dd/12), S*1.2*Math.max(0,1-dd/12));

  if (mountainH !== null) h = mountainH * mBlend + h * (1 - mBlend);

  return Math.max(0, h);
}

/**
 * getBiome(wx, wz, height, S) → biome string
 */
export function getBiome(wx, wz, height, S=4) {
  const lwx=wx/S, lwz=wz/S;
  if (height<=0) return 'ocean';

  const mDist = dist2(lwx,lwz,MOUNTAIN_X,MOUNTAIN_Z);
  if (mDist<30) {
    // Thresholds scaled to the S*33 peak so the summit actually gets snow
    if (height>S*26) return 'snow';
    if (height>S*18) return 'mountain_rock';
    if (height>S*10) return 'mountain_grass';
    return 'mountain_base';
  }

  const zone = getZone(lwx,lwz);
  if (height < S*1.8) return 'beach';
  if (height < S*2.4) return 'pebble';

  switch(zone) {
    case 'salt_marsh':   return 'marsh';
    case 'tidepools':    return height>S*3 ? 'cliff' : 'rocky_shore';
    case 'kelp_cove':    return 'coast_grass';
    case 'sandy_bay':
    case 'hidden_beach': return height<S*2.2 ? 'beach' : 'coast_grass';
    case 'clifftops':    return 'cliff';
    case 'highland_forest': return 'highland_forest';
    case 'wind_ridge':   return 'highland_grass';
    case 'forest':       return 'forest';
    case 'river_valley': return fbm(lwx*.3,lwz*.3,2) > 0.1 ? 'forest' : 'forest_edge';
    case 'harbour':
    case 'fishing_village': return 'coast_grass';
    case 'plains':
    case 'community_farm':
    case 'orchard':      return fbm(lwx*.4+10,lwz*.4+8,2)>0.2 ? 'meadow_dark' : 'meadow';
    case 'town':
    case 'village':
    case 'market_town':
    case 'the_commons':  return 'meadow';
    default:             return 'meadow';
  }
}

/**
 * getSurfaceVoxel(biome, depth) → voxel type string
 */
export function getSurfaceVoxel(biome, depth) {
  switch(biome) {
    case 'ocean':          return 'DEEP_WATER';
    case 'beach':          return depth<=3?'SAND':'STONE';
    case 'pebble':         return depth===0?'PEBBLE':depth<=3?'SAND':'STONE';
    case 'snow':           return depth<=2?'SNOW':'STONE';
    case 'mountain_rock':  return 'STONE';
    case 'mountain_grass': return depth===0?'GRASS_HIGH':depth<=2?'DIRT':'STONE';
    case 'mountain_base':  return depth===0?'GRASS_DARK':depth<=3?'DIRT':'STONE';
    case 'cliff':          return 'STONE_DARK';
    case 'rocky_shore':    return depth===0?'PEBBLE':'STONE';
    case 'coast_grass':    return depth===0?'GRASS':depth<=3?'DIRT':'STONE';
    case 'marsh':          return depth===0?'MOSS':depth<=2?'DIRT':'STONE';
    case 'highland_forest':return depth===0?'GRASS_DARK':depth<=2?'DIRT':'STONE';
    case 'highland_grass': return depth===0?'GRASS_HIGH':depth<=2?'DIRT':'STONE';
    case 'forest':         return depth===0?'GRASS_DARK':depth<=3?'DIRT':'STONE';
    case 'forest_edge':    return depth===0?'MOSS':depth<=3?'DIRT':'STONE';
    case 'meadow_dark':    return depth===0?'GRASS_DARK':depth<=3?'DIRT':'STONE';
    default:               return depth===0?'GRASS':depth<=3?'DIRT':'STONE';
  }
}
