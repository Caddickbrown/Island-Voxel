// game/island.js — Island world population, zone-aware
import { VT, S, SEA_LEVEL, CX, CZ } from '../engine/world.js';
import { getZone } from '../engine/terrain.js';

// Scene.js coords ÷ 5 → logical units, then multiplied by S in world placement
export const AREAS = {
  // Town core
  TOWN_SQUARE:    { x:  0,   z:  0,   label: 'Town Square'         },
  VILLAGE:        { x:  0,   z: -14,  label: 'Village'             },
  BAKERY:         { x: -18,  z: -12,  label: 'Bakery'              },
  POST_OFFICE:    { x:  18,  z: -12,  label: 'Post Office'         },
  CAFE:           { x:  -5,  z: -17,  label: 'The Café'            },
  LIBRARY:        { x:  24,  z:  12,  label: 'Library'             },
  WORKSHOP:       { x: -24,  z:  12,  label: 'Workshop'            },
  PUB:            { x:  -9,  z: -21,  label: 'The Anchor'          },
  SCHOOL:         { x:  12,  z: -21,  label: 'School'              },
  GENERAL_STORE:  { x:  -6,  z: -14,  label: 'General Store'       },
  CYCLE_SHOP:     { x:  -9,  z: -27,  label: 'Cycle Shop'          },
  SPORTS_COURTS:  { x:  33,  z:  -9,  label: 'Sports Courts'       },
  FITNESS_CENTER: { x:  33,  z: -17,  label: 'Fitness Center'      },
  THE_COMMONS:    { x:  10,  z:  10,  label: 'The Commons'         },
  CHURCH:         { x: -22,  z: -20,  label: "St. Clare's"         },
  PLAYER_HOME:    { x:  -5,  z: -25,  label: 'Your Cottage'        },
  // Plains / farm
  FARM:           { x: -54,  z:  24,  label: 'The Farm'            },
  MILL:           { x: -36,  z:  12,  label: 'The Mill'            },
  MAINTENANCE:    { x: -32,  z:  21,  label: 'Maintenance'         },
  COMMUNITY_FARM: { x: -66,  z:  12,  label: 'Community Farm'      },
  ORCHARD:        { x: -50,  z:  40,  label: 'Orchard'             },
  // Forest
  FOREST:         { x:  54,  z:  36,  label: 'Forest Path'         },
  TREEHOUSE:      { x:  56,  z:  38,  label: "Petra's Treehouse"   },
  RIVER_VALLEY:   { x:  40,  z:  20,  label: 'River Valley'        },
  RADIO_STATION:  { x:  33,  z:  15,  label: 'Radio Station'       },
  // Highland
  HIGHLAND_FOREST:{ x: -60,  z: -40,  label: 'Highland Forest'     },
  WIND_RIDGE:     { x:   0,  z: -40,  label: 'Wind Ridge'          },
  CLIFFTOPS:      { x: -30,  z: -54,  label: 'The Clifftops'       },
  CLIFFTOP_PATH:  { x: -50,  z: -60,  label: 'Clifftop Path'       },
  SCIENCE_CENTER: { x: -24,  z: -45,  label: 'Science Centre'      },
  // Mountain
  MOUNTAIN_BASE:  { x: -46,  z: -52,  label: 'Mountain Trail'      },
  THE_SUMMIT:     { x: -46,  z: -52,  label: 'The Summit'          },
  // Harbour / coast
  HARBOUR:        { x:   0,  z:  71,  label: 'The Harbour'         },
  DOCK:           { x:   0,  z:  71,  label: 'The Dock'            },
  LIGHTHOUSE:     { x:  13,  z:  74,  label: 'The Lighthouse'      },
  FISHERY_AREA:   { x:   9,  z:  69,  label: 'Fishery'             },
  FISHING_VILLAGE:{ x:  16,  z:  60,  label: 'Fishing Village'     },
  KELP_COVE:      { x: -36,  z:  68,  label: 'Kelp Cove'           },
  AQUARIUM:       { x:  45,  z: -24,  label: "Elliot's Aquarium"   },
  SANDY_BAY:      { x:  30,  z: -66,  label: 'Sandy Bay'           },
  EAST_BEACH:     { x:  45,  z: -47,  label: 'East Beach'          },
  BEACH_SOUTH:    { x:   0,  z: -66,  label: 'South Beach'         },
  HIDDEN_BEACH:   { x:  60,  z: -70,  label: 'Hidden Beach'        },
  TIDEPOOLS:      { x: -40,  z: -70,  label: 'Tidepools'           },
  SALT_MARSH:     { x: -60,  z: -10,  label: 'Salt Marsh'          },
  RIVER_MOUTH:    { x: -40,  z:  56,  label: 'River Mouth'         },
  // Market
  MARKET_TOWN:    { x: -12,  z: -30,  label: 'Market Town'         },
  KART_TRACK:     { x:  59,  z: -44,  label: 'Kart Track'          },
};

// ── Helpers (all coords in logical units; multiply by S internally) ────────

const wX = lx => Math.round(CX + lx * S);
const wZ = lz => Math.round(CZ + lz * S);

function sY(world, lx, lz) {
  return world.getSurfaceY(wX(lx), wZ(lz));
}

function pave(world, lx, lz, lw, ld, type = VT.PATH) {
  const bx = wX(lx), bz = wZ(lz);
  for (let dx = 0; dx < lw*S; dx++) for (let dz = 0; dz < ld*S; dz++) {
    const by = world.getSurfaceY(bx+dx, bz+dz);
    world.setVoxel(bx+dx, by, bz+dz, type);
  }
}

function path(world, lx1, lz1, lx2, lz2, lw = 2, type = VT.PATH) {
  const steps = Math.ceil(Math.hypot((lx2-lx1)*S, (lz2-lz1)*S) * 2.5);
  for (let i = 0; i <= steps; i++) {
    const t = i/steps, lx = lx1+(lx2-lx1)*t, lz = lz1+(lz2-lz1)*t;
    for (let dw = 0; dw < lw*S; dw++) {
      const bx = Math.round(wX(lx) + dw), bz = wZ(lz);
      world.setVoxel(bx, world.getSurfaceY(bx, bz), bz, type);
    }
  }
}

function house(world, lx, lz, wall, roof, opts = {}) {
  const { w=7, d=6, ht=5, solar=false, twoStory=false } = opts;
  const bx = wX(lx), bz = wZ(lz);
  const by = sY(world, lx + w*0.5, lz + d*0.5);
  const sw=w*S, sd=d*S, sht=ht*S, top=twoStory ? sht*2 : sht;

  pave(world, lx-1, lz-1, w+2, d+2);

  // Walls — 2 voxels thick
  for (let dy=1; dy<=top; dy++) for (let dx=0; dx<sw; dx++) for (let dz=0; dz<sd; dz++) {
    if (twoStory && dy===sht+1) { world.setVoxel(bx+dx,by+dy,bz+dz,VT.PLANK); continue; }
    const xE=dx<2||dx>=sw-2, zE=dz<2||dz>=sd-2;
    world.setVoxel(bx+dx, by+dy, bz+dz, (xE||zE) ? wall : VT.AIR);
  }
  // Overhang on 2-storey
  if (twoStory) for (let dy=sht+1; dy<=top; dy++) for (let dx=0; dx<sw; dx++) world.setVoxel(bx+dx,by+dy,bz-1,wall);

  // Pitched roof with eaves
  const rh = Math.ceil(sw/2);
  for (let ry=0; ry<rh; ry++) for (let dx=ry; dx<sw-ry; dx++) for (let dz=-2; dz<=sd+1; dz++)
    world.setVoxel(bx+dx, by+top+1+ry, bz+dz, roof);
  // Soffit
  for (let dx=-1; dx<=sw; dx++) for (let dz=-2; dz<=sd+1; dz++) {
    const vy = by+top;
    if (world.getVoxel(bx+dx,vy,bz+dz) === VT.AIR) world.setVoxel(bx+dx,vy,bz+dz,VT.PLANK);
  }

  // Door
  const mid = Math.floor(sw/2)-1;
  for (let dy=1; dy<=4; dy++) for (let ddx=0; ddx<2; ddx++) world.setVoxel(bx+mid+ddx, by+dy, bz, VT.DOOR);
  world.setVoxel(bx+mid-1, by+5, bz, VT.STONE); world.setVoxel(bx+mid+2, by+5, bz, VT.STONE);

  // Windows: 2-wide × 3-tall with sills + shutters
  const winPos = [];
  if (sw>=10) { winPos.push([2,0],[sw-4,0],[2,sd-2],[sw-4,sd-2]); }
  if (sd>=8)  { winPos.push([0,Math.floor(sd/2)-1],[sw-2,Math.floor(sd/2)-1]); }
  for (const [wx2,wz2] of winPos) {
    for (let wy=0;wy<3;wy++) for (let wx3=0;wx3<2;wx3++) world.setVoxel(bx+wx2+wx3, by+3+wy, bz+wz2, VT.WINDOW);
    // Sill
    for (let wx3=-1;wx3<=2;wx3++) { const sv=world.getVoxel(bx+wx2+wx3,by+2,bz+wz2); if(sv===VT.AIR) world.setVoxel(bx+wx2+wx3,by+2,bz+wz2,VT.STONE); }
  }

  // Chimney
  const chX=bx+sw-3, chZ=bz+sd-3, chY=by+top+1;
  for (let dy=0;dy<4;dy++) for (let dx=0;dx<2;dx++) for (let dz=0;dz<2;dz++) world.setVoxel(chX+dx,chY+dy,chZ+dz,VT.CHIMNEY);
  for (let dx=-1;dx<=2;dx++) for (let dz=-1;dz<=2;dz++) world.setVoxel(chX+dx,chY+3,chZ+dz,VT.STONE_DARK);

  // Lantern
  world.setVoxel(bx+mid+2, by+4, bz, VT.LANTERN);

  // Solar
  if (solar) {
    const sy2 = by+top+2;
    for (let dx=2;dx<sw-4;dx++) for (let dz2=2;dz2<S*2+2;dz2++)
      world.setVoxel(bx+dx,sy2,bz+dz2,(dx%S===0)?VT.SOLAR_FRAME:VT.SOLAR);
  }
}

function treeOak(world, lx, lz, ht = 9) {
  const bx=wX(lx), bz=wZ(lz), by=sY(world,lx,lz);
  const sh=ht*S;
  for (let dy=1;dy<sh-S*2;dy++) { world.setVoxel(bx,by+dy,bz,VT.WOOD); if(S>1) world.setVoxel(bx+1,by+dy,bz,VT.WOOD); }
  const lf = [VT.LEAF,VT.LEAF,VT.LEAF_DARK,VT.LEAF_AUTUMN][Math.floor(Math.random()*4)];
  for (let ly=0;ly<S*5;ly++) {
    const r=Math.max(0,S*3-Math.floor(ly*.9));
    for (let dx=-r;dx<=r;dx++) for (let dz=-r;dz<=r;dz++) if(dx*dx+dz*dz<=r*r+S) world.setVoxel(bx+dx,by+sh-S*3+ly,bz+dz,lf);
  }
}

function treePine(world, lx, lz, ht = 12) {
  const bx=wX(lx), bz=wZ(lz), by=sY(world,lx,lz);
  const sh=ht*S;
  for (let dy=1;dy<=sh;dy++) { world.setVoxel(bx,by+dy,bz,VT.WOOD); if(S>1) world.setVoxel(bx+1,by+dy,bz,VT.WOOD); }
  for (let ly=0;ly<sh-S*2;ly++) {
    const r=Math.max(0,Math.floor((sh-ly-S*2)*.5)-1);
    for (let dx=-r;dx<=r;dx++) for (let dz=-r;dz<=r;dz++) if(Math.abs(dx)+Math.abs(dz)<=r+1) world.setVoxel(bx+dx,by+S*2+ly,bz+dz,VT.PINE);
  }
}

function treePalm(world, lx, lz) {
  const bx=wX(lx), bz=wZ(lz), by=sY(world,lx,lz);
  const ln=Math.floor(Math.random()*3)-1, lnz=Math.floor(Math.random()*3)-1, sh=S*9;
  for (let dy=1;dy<=sh;dy++) world.setVoxel(bx+Math.round(ln*dy/sh),by+dy,bz+Math.round(lnz*dy/sh),VT.WOOD);
  const tx=bx+ln, ty=by+sh, tz=bz+lnz;
  for (const [dx,dz] of [[-S*3,0],[S*3,0],[0,-S*3],[0,S*3],[-S*2,-S*2],[S*2,-S*2],[-S*2,S*2],[S*2,S*2]])
    for (let i=0;i<3;i++) world.setVoxel(tx+Math.round(dx*(i+1)/3),ty+1-Math.floor(i/2),tz+Math.round(dz*(i+1)/3),VT.PALM);
  world.setVoxel(tx,ty,tz,VT.PALM);
}

function stoneWall(world, lx1, lz1, lx2, lz2) {
  const steps=Math.ceil(Math.hypot((lx2-lx1)*S,(lz2-lz1)*S)*1.4);
  for (let i=0;i<=steps;i++) {
    const t=i/steps, lx=lx1+(lx2-lx1)*t, lz=lz1+(lz2-lz1)*t;
    const bx=wX(lx), bz=wZ(lz), by=sY(world,lx,lz);
    world.setVoxel(bx,by+1,bz,VT.STONE); world.setVoxel(bx,by+2,bz,VT.STONE);
  }
}

// ── Populate ─────────────────────────────────────────────────────────────────
export function populateWorld(world) {
  const interactables = [];

  // ── TOWN ────────────────────────────────────────────────────────────────────
  // Cobbled square
  for (let dx=-S*14;dx<=S*14;dx++) for (let dz=-S*14;dz<=S*14;dz++) {
    const ab=Math.abs(dx), adz=Math.abs(dz), d=ab+adz;
    if (d<=S*8||(ab<=S*2&&adz<=S*12)||(ab<=S*12&&adz<=S*2)) {
      const by=world.getSurfaceY(CX+dx,CZ+dz);
      world.setVoxel(CX+dx,by,CZ+dz,d<=S*5?VT.COBBLE:VT.PATH);
    }
  }

  // Fountain
  { const by=world.getSurfaceY(CX,CZ);
    for (let dx=-S*2;dx<=S*2+S-1;dx++) for (let dz=-S*2;dz<=S*2+S-1;dz++) {
      const e=Math.abs(dx)>=S*2||Math.abs(dz)>=S*2;
      world.setVoxel(CX+dx,by+1,CZ+dz,e?VT.STONE:VT.WATER);
      if(e) world.setVoxel(CX+dx,by+2,CZ+dz,VT.STONE);
    }
    world.setVoxel(CX,by+3,CZ,VT.STONE);
    for (const [dx,dz] of [[-S*3,-S*3],[S*3,-S*3],[-S*3,S*3],[S*3,S*3]])
      world.setVoxel(CX+dx,by+1,CZ+dz,VT.LANTERN);
  }

  // Town buildings
  house(world, -24,-19, VT.YELLOW_WALL, VT.RED_ROOF,   {w:7,d:5,ht:4});
  house(world,   9,-19, VT.WHITE_WALL,  VT.RED_ROOF,   {w:7,d:5,ht:4});
  house(world, -24,-33, VT.CREAM_WALL,  VT.DARK_ROOF,  {w:8,d:6,ht:4});
  house(world,   8,-33, VT.YELLOW_WALL, VT.DARK_ROOF,  {w:7,d:5,ht:4});
  house(world,  -6,-37, VT.WHITE_WALL,  VT.RED_ROOF,   {w:6,d:5,ht:4});
  house(world, -20,-42, VT.CREAM_WALL,  VT.RED_ROOF,   {w:7,d:5,ht:4,solar:true});
  house(world,  12,-42, VT.YELLOW_WALL, VT.BROWN_ROOF, {w:8,d:5,ht:4});
  house(world, -38,-48, VT.BRICK,       VT.DARK_ROOF,  {w:9,d:6,ht:5,twoStory:true});
  house(world,  22,-48, VT.WHITE_WALL,  VT.GREY_ROOF,  {w:9,d:6,ht:4,solar:true});
  // Key landmarks
  house(world, -30,-17, VT.ORANGE_WALL, VT.BROWN_ROOF, {w:10,d:8,ht:5,solar:true}); // Bakery
  house(world,  24,-17, VT.WHITE_WALL,  VT.RED_ROOF,   {w:9,d:7,ht:5});             // Post Office
  house(world,  36, 16, VT.PURPLE_WALL, VT.DARK_ROOF,  {w:13,d:10,ht:6,twoStory:true}); // Library
  house(world, -40, 16, VT.GREY_WALL,   VT.DARK_ROOF,  {w:12,d:10,ht:5,solar:true}); // Workshop
  house(world, -16,-32, VT.CREAM_WALL,  VT.BROWN_ROOF, {w:12,d:9,ht:5,twoStory:true}); // Pub
  house(world,  17,-31, VT.WHITE_WALL,  VT.DARK_ROOF,  {w:14,d:10,ht:5});           // School
  house(world,  -5,-27, VT.CREAM_WALL,  VT.RED_ROOF,   {w:10,d:7,ht:4});            // Café
  house(world,  32, 22, VT.TEAL_WALL,   VT.TEAL_WALL,  {w:9,d:7,ht:4});             // Greenhouse
  house(world, -32, 22, VT.GREY_WALL,   VT.RED_ROOF,   {w:8,d:7,ht:4});             // General Store
  house(world, -30,-26, VT.WHITE_WALL,  VT.GREY_ROOF,  {w:10,d:8,ht:7});            // Church

  // Stained glass windows on church
  { const bx=wX(-30), bz=wZ(-26), by=sY(world,-30,-26);
    for (let dy=3;dy<=7;dy++) {
      world.setVoxel(bx,by+dy,bz+S*4,VT.STAINED_GLASS);
      world.setVoxel(bx,by+dy,bz+S*4+1,VT.STAINED_GLASS);
      world.setVoxel(bx+10*S-1,by+dy,bz+S*4,VT.STAINED_GLASS);
      world.setVoxel(bx+10*S-1,by+dy,bz+S*4+1,VT.STAINED_GLASS);
    }
  }

  // Town paths
  path(world,  0,-12,  0,-42, 3, VT.COBBLE);
  path(world,  0, 12,  0, 66, 3, VT.PATH);
  path(world, -10,-12,-30,-17, 2, VT.PATH);
  path(world,  10,-12, 24,-17, 2, VT.PATH);
  path(world, -12,  8,-40, 16, 2, VT.PATH);
  path(world,  12,  8, 36, 16, 2, VT.PATH);
  path(world,  -8,-24,-16,-32, 2, VT.PATH);
  path(world,   8,-24, 17,-31, 2, VT.PATH);
  path(world,   0,-42,-30,-26, 2, VT.PATH); // to church
  path(world, -10,  0,-62, 18, 2, VT.PATH); // to mill
  path(world,  10,  0, 62,-26, 2, VT.PATH); // to aquarium
  path(world, -14,  0,-80, 36, 2, VT.PATH); // to farm
  path(world,  10, 26, 50, 20, 2, VT.PATH); // to radio

  // ── PLAINS — farm ───────────────────────────────────────────────────────────
  // Barn
  { const bx=wX(-86), bz=wZ(38), by=sY(world,-86,38);
    const bw=S*12, bd=S*9, bht=S*7;
    pave(world,-88,36,14,11);
    for (let dy=1;dy<=bht;dy++) for (let dx=0;dx<bw;dx++) for (let dz=0;dz<bd;dz++) {
      const e=dx<2||dx>=bw-2||dz<2||dz>=bd-2;
      world.setVoxel(bx+dx,by+dy,bz+dz,e?VT.YELLOW_WALL:VT.AIR);
    }
    for (let ry=0;ry<S*3;ry++) for (let dx=ry;dx<bw-ry;dx++) for (let dz=-2;dz<=bd+1;dz++) world.setVoxel(bx+dx,by+bht+1+ry,bz+dz,VT.BROWN_ROOF);
    for (let ry=0;ry<S*4;ry++) for (let dx=ry+S*3;dx<bw-ry-S*3;dx++) for (let dz=-2;dz<=bd+1;dz++) world.setVoxel(bx+dx,by+bht+S*3+1+ry,bz+dz,VT.DARK_ROOF);
    for (let dy=1;dy<=S*5;dy++) for (let ddx=0;ddx<S*3;ddx++) { world.setVoxel(bx+S*3+ddx,by+dy,bz,VT.DOOR); world.setVoxel(bx+bw-S*3-1-ddx+S,by+dy,bz,VT.DOOR); }
    for (let dx=S*2;dx<bw-S*2;dx++) for (let dz=S*2;dz<S*6;dz++) world.setVoxel(bx+dx,by+bht+2,bz+dz,dx%S===0?VT.SOLAR_FRAME:VT.SOLAR);
  }
  house(world,-76,44, VT.CREAM_WALL, VT.RED_ROOF,   {w:9,d:7,ht:4,solar:true}); // farmhouse
  house(world,-98,58, VT.GREY_WALL,  VT.BROWN_ROOF, {w:7,d:5,ht:3});           // tool shed

  // Crop fields (plains zone, south-west)
  for (let fdx=-108;fdx<-62;fdx+=2) for (let fdz=28;fdz<64;fdz+=2) {
    const bx=wX(fdx), bz=wZ(fdz), by=world.getSurfaceY(bx,bz);
    if (by>SEA_LEVEL+1) {
      world.setVoxel(bx,by,bz,VT.FARM_SOIL);
      if (Math.random()<.7) world.setVoxel(bx,by+1,bz,fdz<46?VT.CROP_GREEN:VT.CROP_GOLD);
    }
  }
  stoneWall(world,-110,26,-62,26); stoneWall(world,-62,26,-62,66);
  stoneWall(world,-62,66,-110,66); stoneWall(world,-110,66,-110,26);

  // Windmill
  { const bx=wX(-62), bz=wZ(18), by=sY(world,-62,18);
    const wh=S*19;
    for (let dy=1;dy<=wh;dy++) for (let dx=0;dx<S;dx++) for (let dz=0;dz<S;dz++) world.setVoxel(bx+dx,by+dy,bz+dz,dy<=S*15?VT.STONE:VT.STONE_DARK);
    for (let i=-S*8;i<=S*8;i++) if(i!==0) { world.setVoxel(bx+i,by+S*16,bz,VT.WINDMILL); world.setVoxel(bx,by+S*16+i,bz,VT.WINDMILL); }
    world.setVoxel(bx,by+S*16,bz,VT.METAL);
    house(world,-64,16,VT.STONE,VT.BROWN_ROOF,{w:6,d:5,ht:4});
  }

  // ── COAST ────────────────────────────────────────────────────────────────────
  // Dock (south)
  { const by=SEA_LEVEL;
    for (let dz=0;dz<S*28;dz++) {
      for (let dx=-S*2;dx<=S*3;dx++) world.setVoxel(CX+dx,by,CZ+S*100+dz,VT.DOCK);
      if (dz%S===0) { world.setVoxel(CX-S*2,by-1,CZ+S*100+dz,VT.WOOD); world.setVoxel(CX+S*3,by-1,CZ+S*100+dz,VT.WOOD); }
      if (dz>0&&dz<S*27) { world.setVoxel(CX-S*2,by+1,CZ+S*100+dz,VT.METAL); world.setVoxel(CX+S*3,by+1,CZ+S*100+dz,VT.METAL); }
    }
    path(world,0,66,0,100,2,VT.PATH);
    house(world,-6,90, VT.DOCK,VT.BROWN_ROOF,{w:8,d:6,ht:3});
    house(world, 6,90, VT.WHITE_WALL,VT.RED_ROOF,{w:6,d:5,ht:3});
  }

  // Lighthouse
  { const bx=wX(18), bz=wZ(118), by=SEA_LEVEL;
    for (let dy=1;dy<=S*22;dy++) {
      const r=dy<S*16?S:0;
      for (let dx=-r;dx<=r+S-1;dx++) for (let dz=-r;dz<=r+S-1;dz++)
        world.setVoxel(bx+dx,by+dy,bz+dz,dy<S*16?VT.WHITE_WALL:dy<S*19?VT.RED_ROOF:VT.WHITE_WALL);
    }
    for (let dx=-S;dx<=S*2;dx++) for (let dz=-S;dz<=S*2;dz++) world.setVoxel(bx+dx,by+S*23,bz+dz,VT.WINDOW);
    for (let dx=0;dx<S;dx++) for (let dz=0;dz<S;dz++) world.setVoxel(bx+dx,by+S*24,bz+dz,VT.LANTERN);
    house(world,14,114,VT.WHITE_WALL,VT.RED_ROOF,{w:7,d:5,ht:4});
  }

  // Aquarium (east coast)
  house(world,62,-26, VT.TEAL_WALL, VT.TEAL_WALL, {w:14,d:11,ht:8});
  { const bx=wX(62), bz=wZ(-26), by=sY(world,62,-26);
    for (let dy=S*2;dy<=S*7;dy++) for (let dx=S*2;dx<S*12;dx++) for (let dz=S*2;dz<S*9;dz++) {
      if (world.getVoxel(bx+dx,by+dy,bz+dz)===VT.AIR) world.setVoxel(bx+dx,by+dy,bz+dz,VT.WATER);
    }
    for (let dy=S*3;dy<=S*6;dy++) { world.setVoxel(bx,by+dy,bz+S*4,VT.WINDOW); world.setVoxel(bx,by+dy,bz+S*4+1,VT.WINDOW); }
  }

  // Coast palm trees
  for (let i=0;i<14;i++) {
    const a = -0.5 + Math.random()*0.6 + Math.floor(Math.random()*3)*(Math.PI*2/3);
    const r = 90 + Math.random()*10;
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    if (sY(world,lx,lz) <= SEA_LEVEL + S*3) treePalm(world,lx,lz);
  }

  // Coast reed beds (tidal east)
  for (let i=0;i<40;i++) {
    const lx=55+Math.random()*12, lz=60+Math.random()*20;
    const bx=wX(lx), bz=wZ(lz), by=world.getSurfaceY(bx,bz);
    if (by<=SEA_LEVEL+S*2) world.setVoxel(bx,by+1,bz,VT.REED);
  }

  // ── FOREST ───────────────────────────────────────────────────────────────────
  // Radio mast (on forest edge)
  { const bx=wX(50), bz=wZ(20), by=sY(world,50,20);
    for (let dy=1;dy<=S*24;dy++) world.setVoxel(bx,by+dy,bz,VT.METAL);
    for (let i=1;i<=S*7;i++) { world.setVoxel(bx+i,by+S*24-i*2,bz+i,VT.METAL); world.setVoxel(bx-i,by+S*24-i*2,bz-i,VT.METAL); }
    house(world,48,18,VT.GREY_WALL,VT.DARK_ROOF,{w:7,d:5,ht:3,solar:true});
  }

  // Treehouse
  { const bx=wX(72), bz=wZ(64), by=sY(world,72,64), ht=S*16;
    for (const [dx,dz] of [[0,0],[S*5,0],[0,S*5],[S*5,S*5]]) for (let dy=1;dy<=ht;dy++) world.setVoxel(bx+dx,by+dy,bz+dz,VT.WOOD);
    for (let dx=-S;dx<=S*6;dx++) for (let dz=-S;dz<=S*6;dz++) world.setVoxel(bx+dx,by+ht,bz+dz,VT.PLANK);
    for (let dy=1;dy<=S*5;dy++) for (let dx=0;dx<S*5;dx++) for (let dz=0;dz<S*5;dz++) {
      const e=dx<1||dx>=S*5-1||dz<1||dz>=S*5-1;
      world.setVoxel(bx+dx,by+ht+dy,bz+dz,e?VT.BROWN_ROOF:VT.AIR);
    }
    world.setVoxel(bx+S*2,by+ht+1,bz,VT.DOOR); world.setVoxel(bx+S*2,by+ht+2,bz,VT.DOOR);
    for (let ry=0;ry<S*3;ry++) for (let dx=ry;dx<S*5-ry;dx++) for (let dz=-1;dz<=S*5;dz++) world.setVoxel(bx+dx,by+ht+S*5+1+ry,bz+dz,VT.DARK_ROOF);
    for (let dy=0;dy<ht;dy+=S) world.setVoxel(bx+S*2,by+dy,bz-1,VT.PLANK);
  }

  // Forest trees — NE quadrant
  for (let i=0;i<120;i++) {
    const a = Math.random()*1.9 - 0.4; // angle -0.4 to 1.5 (NE sector)
    const r = 30 + Math.random()*80;
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    const zone = getZone(lx,lz);
    if (zone==='forest'&&sY(world,lx,lz)>SEA_LEVEL+S*2)
      Math.random()<.35 ? treePine(world,lx,lz,10+Math.floor(Math.random()*6)) : treeOak(world,lx,lz,8+Math.floor(Math.random()*5));
  }

  // ── MOUNTAIN TRAIL ──────────────────────────────────────────────────────────
  path(world,-16,0,-46,-52,2,VT.PATH); // trail up to mountain base
  // Stone waymarker at base
  { const bx=wX(-44), bz=wZ(-50), by=sY(world,-44,-50);
    world.setVoxel(bx,by+1,bz,VT.STONE); world.setVoxel(bx,by+2,bz,VT.STONE);
    world.setVoxel(bx,by+3,bz,VT.LANTERN);
  }
  // Science centre (on plains side, away from mountain)
  house(world,-40,-80,VT.WHITE_WALL,VT.GREY_ROOF,{w:16,d:12,ht:6,twoStory:true,solar:true});

  // ── SCATTERED TREES (plains + general) ─────────────────────────────────────
  for (let i=0;i<80;i++) {
    const a=Math.random()*Math.PI*2, r=20+Math.random()*75;
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    const zone=getZone(lx,lz);
    if ((zone==='plains'||zone==='coast')&&sY(world,lx,lz)>SEA_LEVEL+S*2)
      treeOak(world,lx,lz,7+Math.floor(Math.random()*4));
  }

  // ── FLOWERS (all green zones) ───────────────────────────────────────────────
  const flrs=[VT.FLOWER_R,VT.FLOWER_Y,VT.FLOWER_P,VT.FLOWER_W];
  for (let i=0;i<350;i++) {
    const a=Math.random()*Math.PI*2, r=6+Math.random()*100;
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    const bx=wX(lx), bz=wZ(lz), by=world.getSurfaceY(bx,bz);
    const t=world.getVoxel(bx,by,bz);
    if (by>SEA_LEVEL+1&&(t===VT.GRASS||t===VT.GRASS_DARK||t===VT.MOSS||t===VT.GRASS_HIGH))
      world.setVoxel(bx,by+1,bz,flrs[Math.floor(Math.random()*4)]);
  }

  // Mushrooms in forest shade
  for (let i=0;i<60;i++) {
    const a=Math.random()*1.9-.4, r=35+Math.random()*60;
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    const bx=wX(lx), bz=wZ(lz), by=world.getSurfaceY(bx,bz);
    if (by>SEA_LEVEL+1&&(world.getVoxel(bx,by,bz)===VT.GRASS_DARK||world.getVoxel(bx,by,bz)===VT.MOSS))
      world.setVoxel(bx,by+1,bz,VT.MUSHROOM);
  }

  // Register all named areas as interactables
  for (const [key, area] of Object.entries(AREAS)) {
    interactables.push({ pos:[wX(area.x), 0, wZ(area.z)], type:key.toLowerCase(), label:area.label });
  }

  return interactables;
}
