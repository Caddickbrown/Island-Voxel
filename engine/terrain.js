// engine/terrain.js — Heightmap + zone-based biome generator

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

// ─── Zone definitions (in logical units, pre-scale) ───────────────────────
// Island radius ~62 logical units
// Town:     centre, radius ~18
// Plains:   surrounds town, extends to radius ~45, south/east bias
// Forest:   NE quadrant, roughly 30–70 units from centre
// Mountain: NW corner, centred at (-46, -52), radius ~30
// Coast:    the outer ring, 0–12 units inside the shoreline

/**
 * getZone(lwx, lwz) — logical coords (pre-scale), returns zone string.
 * Called by getBiome for spatial layout.
 */
export function getZone(lwx, lwz) {
  const d = Math.sqrt(lwx*lwx + lwz*lwz);

  // Mountain (NW)
  const md = Math.sqrt((lwx+46)**2 + (lwz+52)**2);
  if (md < 32) return 'mountain';

  // Town (centre)
  if (d < 18) return 'town';

  // Forest (NE quadrant: positive X, negative-to-neutral Z)
  // angle roughly -0.3 to 1.5 radians (east to NE)
  const a = Math.atan2(lwz, lwx);
  if (d > 14 && d < 68 && a > -0.4 && a < 1.6) return 'forest';

  // Coast (outer ring, inside shoreline by ~10 units)
  if (d > 50) return 'coast';

  // Plains (everything else — S, SW, W of town)
  return 'plains';
}

/**
 * islandHeight(wx, wz, S) — voxel offsets from world centre.
 * Returns float height above sea in voxels.
 */
export function islandHeight(wx, wz, S=4) {
  const lwx = wx/S, lwz = wz/S; // logical coords
  const d = Math.sqrt(lwx*lwx + lwz*lwz);
  const a = Math.atan2(lwz, lwx);

  // Organic coastline
  const r = 62 + 14*Math.sin(a*3+.22) + 8*Math.sin(a*7+1.38)
              +  4*Math.sin(a*11-.82) + 2*Math.sin(a*17+2.1) + Math.sin(a*23-1.4);
  const ef = Math.max(0, 1 - d/r);
  if (ef <= 0) return 0;
  const fade = Math.min(1, ef * 5);
  const fs = 1/S;

  const zone = getZone(lwx, lwz);

  // ── Mountain (NW) — dramatic standalone peak ────────────────────────────
  const md = Math.sqrt((lwx+46)**2 + (lwz+52)**2);
  if (md < 30) {
    const mf = Math.max(0, 1 - md/30);
    const cone = S * 52 * mf**1.4;
    const rough = fbm(wx*fs*.3+8.4, wz*fs*.3+2.6, 4) * S*5 * mf;
    // Foothills blending into plains
    const foothills = S*4 * Math.max(0, 1 - md/30)**0.5;
    return Math.max(foothills, cone + rough);
  }

  // ── Base height per zone ──────────────────────────────────────────────────
  let h;
  if (zone === 'town') {
    // Very flat — consistent S*2 with tiny variation
    h = S*2 + fbm(wx*fs*.15+0.5, wz*fs*.15+0.5, 3) * S*0.4;
    h *= fade;
  }
  else if (zone === 'plains') {
    // Gently rolling — max S*3.5, mostly S*2–3
    h = S*2 * fade;
    h += fbm(wx*fs*.07+1.1, wz*fs*.07+3.3, 4) * S*2 * fade;
    h += fbm(wx*fs*.18+5,   wz*fs*.18+2,   3) * S*0.8 * fade;
    h = Math.max(h, S*1.5 * fade);
  }
  else if (zone === 'forest') {
    // Slightly hillier than plains — dense canopy will define it more than terrain
    h = S*2.5 * fade;
    h += fbm(wx*fs*.09+2.2, wz*fs*.09+4.1, 4) * S*2.5 * fade;
    h += fbm(wx*fs*.22+6,   wz*fs*.22+1.8, 3) * S*1.2 * fade;
    h = Math.max(h, S*1.8 * fade);
  }
  else if (zone === 'coast') {
    // Low, close to sea — beaches, rock pools, slight variation
    h = S*1.2 * fade;
    h += fbm(wx*fs*.12+3.3, wz*fs*.12+1.1, 3) * S*1.5 * fade;
    // Occasional rocky headlands
    const headland = fbm(wx*fs*.25+9, wz*fs*.25+6, 2);
    if (headland > 0.35) h += S*3 * (headland - 0.35) * 2.5 * fade;
  }
  else {
    // Fallback
    h = S*2 * fade;
  }

  // Dock spit (south) — keep very flat
  const dd = Math.sqrt(lwx*lwx + (lwz-62)**2);
  if (dd < 12) h = Math.max(h*(dd/12), S*1.2*Math.max(0,1-dd/12));

  return Math.max(0, h);
}

/**
 * getBiome(wx, wz, height, S) — surface biome string for colour/voxel selection.
 */
export function getBiome(wx, wz, height, S=4) {
  const lwx=wx/S, lwz=wz/S;
  if (height <= 0) return 'ocean';

  const zone = getZone(lwx, lwz);
  const md = Math.sqrt((lwx+46)**2 + (lwz+52)**2);

  // Mountain zones
  if (md < 30) {
    if (height > S*48) return 'snow';
    if (height > S*34) return 'mountain_rock';
    if (height > S*18) return 'mountain_grass';
    return 'mountain_base';
  }

  // Coast biomes
  if (zone === 'coast') {
    if (height < S*1.8) return 'beach';
    const h = fbm(lwx*.25+9, lwz*.25+6, 2);
    return h > 0.35 ? 'cliff' : 'coast_grass';
  }

  // Beach fringe on any zone near shoreline
  if (height < S*2.0) return 'beach';
  if (height < S*2.6) return 'pebble';

  // Zone-based surface
  if (zone === 'forest') return height < S*2.6 ? 'forest_edge' : 'forest';
  if (zone === 'town')   return 'meadow'; // town surface grass (buildings override)
  if (zone === 'plains') {
    // Mix of meadow and dark grass, with patches
    const n = fbm(lwx*.4+10, lwz*.4+8, 2);
    return n > 0.2 ? 'meadow_dark' : 'meadow';
  }
  return 'meadow';
}

/**
 * getSurfaceVoxel(biome, depth) → voxel type string
 */
export function getSurfaceVoxel(biome, depth) {
  switch(biome) {
    case 'ocean':         return 'DEEP_WATER';
    case 'beach':         return depth <= 3 ? 'SAND' : 'STONE';
    case 'pebble':        return depth === 0 ? 'PEBBLE' : depth <= 3 ? 'SAND' : 'STONE';
    case 'snow':          return depth <= 2 ? 'SNOW' : 'STONE';
    case 'mountain_rock': return 'STONE';
    case 'mountain_grass':return depth === 0 ? 'GRASS_HIGH' : depth <= 2 ? 'DIRT' : 'STONE';
    case 'mountain_base': return depth === 0 ? 'GRASS_DARK' : depth <= 3 ? 'DIRT' : 'STONE';
    case 'cliff':         return depth === 0 ? 'STONE_DARK' : 'STONE';
    case 'coast_grass':   return depth === 0 ? 'GRASS' : depth <= 3 ? 'DIRT' : 'STONE';
    case 'forest':        return depth === 0 ? 'GRASS_DARK' : depth <= 3 ? 'DIRT' : 'STONE';
    case 'forest_edge':   return depth === 0 ? 'MOSS' : depth <= 3 ? 'DIRT' : 'STONE';
    case 'meadow_dark':   return depth === 0 ? 'GRASS_DARK' : depth <= 3 ? 'DIRT' : 'STONE';
    default:              return depth === 0 ? 'GRASS' : depth <= 3 ? 'DIRT' : 'STONE'; // meadow
  }
}
