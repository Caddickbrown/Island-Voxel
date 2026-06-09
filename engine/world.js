// engine/world.js — Chunk manager and voxel world
import { islandHeight, getBiome, getSurfaceVoxel } from './terrain.js';

export const CHUNK_SIZE = 32;
export const VS = 0.5;    // Three.js units per voxel
export const S  = 4;      // feature scale multiplier
export const SEA_LEVEL = S * 9; // 36

// World grid centre in voxels (matches W=640,D=640 grid)
export const CX = 320, CZ = 320;

export const VT = Object.freeze({
  AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, WATER:5, DEEP_WATER:6,
  SNOW:7, ROCK:8, MOSS:9, PEBBLE:10, GRASS_DARK:11, GRASS_HIGH:12,
  SAND_WET:13, WOOD:14, LEAF:15, LEAF_DARK:16, LEAF_AUTUMN:17,
  PINE:18, PALM:19, WHITE_WALL:20, CREAM_WALL:21, YELLOW_WALL:22,
  ORANGE_WALL:23, PURPLE_WALL:24, TEAL_WALL:25, GREY_WALL:26,
  BRICK:27, RED_ROOF:28, DARK_ROOF:29, BROWN_ROOF:30, GREY_ROOF:31,
  PLANK:32, DOOR:33, WINDOW:34, SOLAR:35, FARM_SOIL:36,
  CROP_GREEN:37, CROP_GOLD:38, PATH:39, COBBLE:40, DOCK:41,
  CHIMNEY:42, FENCE:43, METAL:44, LANTERN:45,
  FLOWER_R:46, FLOWER_Y:47, FLOWER_P:48, FLOWER_W:49,
  MUSHROOM:50, REED:51, STONE_DARK:52, WATER_SHALLOW:53,
  SOLAR_FRAME:54, STAINED_GLASS:55, WINDMILL:56,
});

// String → int helper
export function vt(name) {
  const v = VT[name];
  if (v === undefined) throw new Error(`Unknown voxel type: ${name}`);
  return v;
}

const C3 = CHUNK_SIZE ** 3;

// Shared zeroed chunk for all-air regions — avoids allocating 32KB per sky chunk.
// Copied-on-write in setVoxel.
const EMPTY_CHUNK = new Uint8Array(C3);

// Biome → voxel id by depth (index 0..3 = depth, index 4 = anything deeper)
const _layerCache = new Map();
function layersFor(biome) {
  let l = _layerCache.get(biome);
  if (!l) {
    l = new Uint8Array(5);
    for (let d = 0; d < 5; d++) {
      const name = getSurfaceVoxel(biome, d === 4 ? 8 : d);
      l[d] = VT[name] !== undefined ? VT[name] : VT.STONE;
    }
    _layerCache.set(biome, l);
  }
  return l;
}

export class World {
  constructor() {
    this.chunks     = new Map(); // "cx,cy,cz" → Uint8Array(32³)
    this._surfCache = new Map(); // "wx,wz" → surfaceY
    this._colCache  = new Map(); // "ccx,ccz" → per-column heights/biomes for a chunk column
    this.dirtyMesh  = new Set(); // chunk keys whose mesh is stale after setVoxel
  }

  _ck(cx,cy,cz) { return `${cx},${cy},${cz}`; }

  // Per-chunk-column terrain data, computed once and shared by all 6 Y slabs.
  _columns(ccx, ccz) {
    const k = `${ccx},${ccz}`;
    let col = this._colCache.get(k);
    if (col) return col;
    const C = CHUNK_SIZE;
    const ty     = new Int16Array(C*C);
    const layers = new Array(C*C);
    const water  = new Uint8Array(C*C);
    let maxTy = 0;
    for (let lz=0; lz<C; lz++) for (let lx=0; lx<C; lx++) {
      const wx = ccx*C+lx, wz = ccz*C+lz;
      const rwx = wx-CX, rwz = wz-CZ; // relative to island centre
      const h = islandHeight(rwx, rwz, S);
      const t = Math.floor(SEA_LEVEL + h);
      const i = lx + lz*C;
      ty[i]     = t;
      water[i]  = h <= 0.2 ? 1 : 0;
      layers[i] = layersFor(getBiome(rwx, rwz, h, S));
      if (t > maxTy) maxTy = t;
    }
    col = { ty, layers, water, maxTy };
    if (this._colCache.size > 4096) this._colCache.clear();
    this._colCache.set(k, col);
    return col;
  }

  getChunk(cx,cy,cz) {
    const k = this._ck(cx,cy,cz);
    let c = this.chunks.get(k);
    if (c === undefined) {
      const data = new Uint8Array(C3);
      c = this._gen(data, cx, cy, cz) ? data : EMPTY_CHUNK;
      this.chunks.set(k, c);
    }
    return c;
  }

  isChunkEmpty(cx,cy,cz) {
    return this.getChunk(cx,cy,cz) === EMPTY_CHUNK;
  }

  // Returns true if the chunk contains any non-air voxel
  _gen(data, cx, cy, cz) {
    const C = CHUNK_SIZE;
    const col = this._columns(cx, cz);
    const yBase = cy*C, yTopSlab = yBase + C - 1;
    if (yBase > col.maxTy && yBase > SEA_LEVEL) return false; // pure sky
    let solid = false;

    for (let lz=0; lz<C; lz++) for (let lx=0; lx<C; lx++) {
      const ci = lx + lz*C;
      const t = col.ty[ci], layers = col.layers[ci];
      const top = Math.min(t, yTopSlab);
      for (let wy=yBase; wy<=top; wy++) {
        const depth = t - wy;
        data[lx + lz*C + (wy-yBase)*C*C] = layers[depth > 4 ? 4 : depth];
        solid = true;
      }
      if (col.water[ci]) { // shallow water fills above terrain up to sea level
        const wTop = Math.min(SEA_LEVEL, yTopSlab);
        for (let wy=Math.max(yBase, t+1); wy<=wTop; wy++) {
          data[lx + lz*C + (wy-yBase)*C*C] = VT.WATER;
          solid = true;
        }
      }
    }
    return solid;
  }

  getVoxel(wx,wy,wz) {
    const C = CHUNK_SIZE;
    // Floor-divide (handles negatives)
    const cx=Math.floor(wx/C), cy=Math.floor(wy/C), cz=Math.floor(wz/C);
    const chunk = this.getChunk(cx,cy,cz);
    const lx=wx-cx*C, ly=wy-cy*C, lz=wz-cz*C;
    return chunk[lx + lz*C + ly*C*C];
  }

  setVoxel(wx,wy,wz,type) {
    const C = CHUNK_SIZE;
    const cx=Math.floor(wx/C), cy=Math.floor(wy/C), cz=Math.floor(wz/C);
    const k = this._ck(cx,cy,cz);
    let chunk = this.getChunk(cx,cy,cz);
    if (chunk === EMPTY_CHUNK) { // copy-on-write for shared air chunk
      chunk = new Uint8Array(C3);
      this.chunks.set(k, chunk);
    }
    const lx=wx-cx*C, ly=wy-cy*C, lz=wz-cz*C;
    chunk[lx + lz*C + ly*C*C] = type;
    this._surfCache.delete(`${wx},${wz}`);

    // Mark this chunk (and boundary neighbours, for face culling/AO) stale
    this.dirtyMesh.add(k);
    if (lx===0)   this.dirtyMesh.add(this._ck(cx-1,cy,cz));
    if (lx===C-1) this.dirtyMesh.add(this._ck(cx+1,cy,cz));
    if (ly===0)   this.dirtyMesh.add(this._ck(cx,cy-1,cz));
    if (ly===C-1) this.dirtyMesh.add(this._ck(cx,cy+1,cz));
    if (lz===0)   this.dirtyMesh.add(this._ck(cx,cy,cz-1));
    if (lz===C-1) this.dirtyMesh.add(this._ck(cx,cy,cz+1));
    return k;
  }

  isSolid(wx,wy,wz) {
    const v = this.getVoxel(wx,wy,wz);
    return v !== VT.AIR && v !== VT.WATER && v !== VT.DEEP_WATER
        && v !== VT.WATER_SHALLOW && v !== VT.FLOWER_R && v !== VT.FLOWER_Y
        && v !== VT.FLOWER_P && v !== VT.FLOWER_W && v !== VT.REED && v !== VT.MUSHROOM;
  }

  getSurfaceY(wx,wz) {
    const k = `${wx},${wz}`;
    const cached = this._surfCache.get(k);
    if (cached !== undefined) return cached;
    const C = CHUNK_SIZE;
    const ccx = Math.floor(wx/C), ccz = Math.floor(wz/C);
    for (let cy=5; cy>=0; cy--) { // scan full world height, skipping air chunks
      if (this.isChunkEmpty(ccx,cy,ccz)) continue;
      for (let wy=cy*C+C-1; wy>=cy*C; wy--) {
        if (this.isSolid(wx,wy,wz)) { this._surfCache.set(k,wy); return wy; }
      }
    }
    this._surfCache.set(k, SEA_LEVEL);
    return SEA_LEVEL;
  }

  // Returns [{cx,cy,cz,lod,dist}] for chunks within view distance
  getChunksInRange(playerWX, playerWZ, viewDist=8) {
    const C = CHUNK_SIZE;
    const pcx = Math.floor(playerWX/C), pcz = Math.floor(playerWZ/C);
    const out = [];
    for (let dx=-viewDist; dx<=viewDist; dx++) for (let dz=-viewDist; dz<=viewDist; dz++) {
      const dist2d = Math.sqrt(dx*dx+dz*dz);
      if (dist2d > viewDist) continue;
      const lod = dist2d < 3 ? 0 : dist2d < 6 ? 1 : 2;
      for (let cy=0; cy<6; cy++) // Y slabs 0–5 = voxels 0–191
        out.push({ cx:pcx+dx, cy, cz:pcz+dz, lod, dist:dist2d });
    }
    return out;
  }

  // Get the chunk data and its neighbours (for seam culling + AO).
  // Neighbours are generated on demand so chunk borders mesh correctly;
  // all-air neighbours are returned as null (treated as air by the mesher).
  getChunkWithNeighbours(cx,cy,cz) {
    const data = this.getChunk(cx,cy,cz);
    const nbrs = {};
    for (const [dx,dy,dz] of [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
      [1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1] // diagonals for AO corners
    ]) {
      const k = `${dx},${dy},${dz}`;
      const nd = this.getChunk(cx+dx, cy+dy, cz+dz);
      nbrs[k] = nd === EMPTY_CHUNK ? null : nd;
    }
    return { data, nbrs };
  }
}
