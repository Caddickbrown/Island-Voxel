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
  SOLAR_FRAME:54, STAINED_GLASS:55,
});

// String → int helper
export function vt(name) {
  const v = VT[name];
  if (v === undefined) throw new Error(`Unknown voxel type: ${name}`);
  return v;
}

export class World {
  constructor() {
    this.chunks   = new Map(); // "cx,cy,cz" → Uint8Array(32³)
    this._surfCache = new Map(); // "wx,wz" → surfaceY
  }

  _ck(cx,cy,cz) { return `${cx},${cy},${cz}`; }

  getChunk(cx,cy,cz) {
    const k = this._ck(cx,cy,cz);
    if (!this.chunks.has(k)) {
      const data = new Uint8Array(CHUNK_SIZE**3);
      this.chunks.set(k, data);
      this._gen(data, cx, cy, cz);
    }
    return this.chunks.get(k);
  }

  _gen(data, cx, cy, cz) {
    const C = CHUNK_SIZE;
    for (let lz=0; lz<C; lz++) for (let lx=0; lx<C; lx++) {
      const wx = cx*C+lx, wz = cz*C+lz;
      const rwx = wx-CX, rwz = wz-CZ; // relative to island centre
      const h = islandHeight(rwx, rwz, S);
      const ty = Math.floor(SEA_LEVEL + h);

      for (let ly=0; ly<C; ly++) {
        const wy = cy*C+ly;
        const i = lx + lz*C + ly*C*C;
        if (wy > ty) {
          data[i] = (wy <= SEA_LEVEL && h <= 0.2) ? VT.WATER : VT.AIR;
        } else {
          const depth = ty - wy;
          const biome = getBiome(rwx, rwz, h, S);
          const name  = getSurfaceVoxel(biome, depth);
          data[i] = VT[name] ?? VT.STONE;
        }
      }
    }
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
    // Ensure chunk exists
    const chunk = this.getChunk(cx,cy,cz);
    const lx=wx-cx*C, ly=wy-cy*C, lz=wz-cz*C;
    chunk[lx + lz*C + ly*C*C] = type;
    this._surfCache.delete(`${wx},${wz}`);
    // Return chunk key so renderer can mark it dirty
    return this._ck(cx,cy,cz);
  }

  isSolid(wx,wy,wz) {
    const v = this.getVoxel(wx,wy,wz);
    return v !== VT.AIR && v !== VT.WATER && v !== VT.DEEP_WATER
        && v !== VT.WATER_SHALLOW && v !== VT.FLOWER_R && v !== VT.FLOWER_Y
        && v !== VT.FLOWER_P && v !== VT.FLOWER_W && v !== VT.REED && v !== VT.MUSHROOM;
  }

  getSurfaceY(wx,wz) {
    const k = `${wx},${wz}`;
    if (this._surfCache.has(k)) return this._surfCache.get(k);
    for (let wy=159; wy>=0; wy--) {
      if (this.isSolid(wx,wy,wz)) { this._surfCache.set(k,wy); return wy; }
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

  // Get the chunk data and its 6 immediate neighbours (for seam AO)
  getChunkWithNeighbours(cx,cy,cz) {
    const data = this.getChunk(cx,cy,cz);
    const nbrs = {};
    for (const [dx,dy,dz] of [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
      [1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1] // diagonals for AO corners
    ]) {
      const k = `${dx},${dy},${dz}`;
      if (!nbrs[k]) nbrs[k] = this.chunks.get(this._ck(cx+dx,cy+dy,cz+dz)) ?? null;
    }
    return { data, nbrs };
  }
}
