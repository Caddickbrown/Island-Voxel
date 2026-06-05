// game/island.js — Island world placement (buildings, paths, trees, etc.)
// Uses world.setVoxel() with VT type constants.
import { VT, vt, S, SEA_LEVEL, CX, CZ } from '../engine/world.js';

// Named areas (logical coords, pre-scale). Match Island's scene.js AREAS ÷ 4
export const AREAS = {
  TOWN_SQUARE:   { x:  0, z:  0,  label: 'Town Square'       },
  BAKERY:        { x:-24, z:-16,  label: 'Bakery'             },
  POST_OFFICE:   { x: 22, z:-16,  label: 'Post Office'        },
  LIBRARY:       { x: 36, z: 16,  label: 'Library'            },
  WORKSHOP:      { x:-40, z: 16,  label: 'Workshop'           },
  PUB:           { x:-16, z:-32,  label: 'The Anchor'         },
  SCHOOL:        { x: 17, z:-31,  label: 'School'             },
  CAFE:          { x: -5, z:-27,  label: 'The Café'           },
  DOCK:          { x:  0, z: 98,  label: 'The Dock'           },
  FARM:          { x:-76, z: 44,  label: 'The Farm'           },
  LIGHTHOUSE:    { x: 18, z:118,  label: 'Lighthouse'         },
  WINDMILL:      { x:-62, z: 18,  label: 'The Mill'           },
  RADIO:         { x: 50, z: 20,  label: 'Radio Station'      },
  AQUARIUM:      { x: 62, z:-26,  label: "Elliot's Aquarium"  },
  TREEHOUSE:     { x: 72, z: 64,  label: "Petra's Treehouse"  },
  SCIENCE:       { x:-40, z:-80,  label: 'Science Centre'     },
  CHURCH:        { x:-30, z:-26,  label: 'St. Clare\'s'       },
  PLAYER_HOME:   { x: -5, z:-32,  label: 'Your Cottage'       },
};

// Helpers — all in logical coords (multiply by S internally)
function sY(world, lx, lz) {
  return world.getSurfaceY(Math.round(CX + lx*S), Math.round(CZ + lz*S));
}

function setV(world, lx, ly, lz, type) {
  world.setVoxel(Math.round(CX + lx*S), ly, Math.round(CZ + lz*S), type);
}

function fillBox(world, lx, ly, lz, lw, lh, ld, type) {
  const bx = Math.round(CX + lx*S), bz = Math.round(CZ + lz*S);
  for (let dx=0; dx<lw*S; dx++) for (let dy=0; dy<lh*S; dy++) for (let dz=0; dz<ld*S; dz++)
    world.setVoxel(bx+dx, ly+dy, bz+dz, type);
}

function pave(world, lx, lz, lw, ld, type=VT.PATH) {
  const bx=Math.round(CX+lx*S), bz=Math.round(CZ+lz*S);
  for (let dx=0; dx<lw*S; dx++) for (let dz=0; dz<ld*S; dz++) {
    const by=sY(world, lx + dx/S, lz + dz/S);
    world.setVoxel(bx+dx, by, bz+dz, type);
  }
}

function path(world, lx1, lz1, lx2, lz2, lw=2, type=VT.PATH) {
  const steps = Math.ceil(Math.hypot((lx2-lx1)*S, (lz2-lz1)*S) * 2.5);
  for (let i=0; i<=steps; i++) {
    const t=i/steps;
    const lx=lx1+(lx2-lx1)*t, lz=lz1+(lz2-lz1)*t;
    for (let dw=0; dw<lw*S; dw++) {
      const bx=Math.round(CX+lx*S+dw), bz=Math.round(CZ+lz*S);
      const by=sY(world, lx+dw/S, lz);
      world.setVoxel(bx, by, bz, type);
    }
  }
}

function house(world, lx, lz, wall, roof, opts={}) {
  const { w=7, d=6, ht=5, solar=false, twoStory=false } = opts;
  const bx=Math.round(CX+lx*S), bz=Math.round(CZ+lz*S);
  const by=sY(world, lx+w*0.5, lz+d*0.5);
  const sw=w*S, sd=d*S, sht=ht*S, top=twoStory?sht*2:sht;
  pave(world, lx-1, lz-1, w+2, d+2);
  // Walls (2-voxel thick)
  for (let dy=1; dy<=top; dy++) for (let dx=0; dx<sw; dx++) for (let dz=0; dz<sd; dz++) {
    if (twoStory && dy===sht+1) { world.setVoxel(bx+dx,by+dy,bz+dz,VT.PLANK); continue; }
    const xE=dx<2||dx>=sw-2, zE=dz<2||dz>=sd-2;
    world.setVoxel(bx+dx, by+dy, bz+dz, (xE||zE)?wall:VT.AIR);
  }
  // Pitched roof
  const rh=Math.ceil(sw/2);
  for (let ry=0; ry<rh; ry++) for (let dx=ry; dx<sw-ry; dx++) for (let dz=-2; dz<=sd+1; dz++)
    world.setVoxel(bx+dx, by+top+1+ry, bz+dz, roof);
  // Door
  const mid=Math.floor(sw/2)-1;
  for (let dy=1; dy<=4; dy++) for (let ddx=0; ddx<2; ddx++) world.setVoxel(bx+mid+ddx, by+dy, bz, VT.DOOR);
  // Windows
  const wps=[];
  if(sw>=10){wps.push([2,0],[sw-4,0],[2,sd-2],[sw-4,sd-2]);}
  if(sd>=8) {wps.push([0,Math.floor(sd/2)-1],[sw-2,Math.floor(sd/2)-1]);}
  for (const[wx2,wz2]of wps) {
    for(let wy=0;wy<3;wy++) for(let wx3=0;wx3<2;wx3++) world.setVoxel(bx+wx2,by+3+wy,bz+wz2,VT.WINDOW);
  }
  // Chimney
  for(let dy=0;dy<4;dy++) for(let dx=0;dx<2;dx++) for(let dz=0;dz<2;dz++)
    world.setVoxel(bx+sw-3+dx, by+top+1+dy, bz+sd-3+dz, VT.CHIMNEY);
  // Lantern
  world.setVoxel(bx+mid+2, by+4, bz, VT.LANTERN);
  // Solar
  if (solar) {
    const sy2=by+top+2;
    for(let dx=2;dx<sw-4;dx++) for(let dz2=2;dz2<S*2+2;dz2++)
      world.setVoxel(bx+dx,sy2,bz+dz2,(dx%S===0)?VT.SOLAR_FRAME:VT.SOLAR);
  }
}

function treeOak(world, lx, lz, ht=9) {
  const bx=Math.round(CX+lx*S), bz=Math.round(CZ+lz*S), by=sY(world,lx,lz);
  const sh=ht*S;
  for(let dy=1;dy<sh-S*2;dy++){world.setVoxel(bx,by+dy,bz,VT.WOOD);if(S>1)world.setVoxel(bx+1,by+dy,bz,VT.WOOD);}
  const lf=[VT.LEAF,VT.LEAF_DARK,VT.LEAF_AUTUMN][Math.random()<.7?0:Math.random()<.5?1:2];
  for(let ly=0;ly<S*5;ly++){const r=Math.max(0,S*3-Math.floor(ly*.9));for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++) if(dx*dx+dz*dz<=r*r+S) world.setVoxel(bx+dx,by+sh-S*3+ly,bz+dz,lf);}
}

function treePine(world, lx, lz, ht=12) {
  const bx=Math.round(CX+lx*S), bz=Math.round(CZ+lz*S), by=sY(world,lx,lz);
  const sh=ht*S;
  for(let dy=1;dy<=sh;dy++){world.setVoxel(bx,by+dy,bz,VT.WOOD);if(S>1)world.setVoxel(bx+1,by+dy,bz,VT.WOOD);}
  for(let ly=0;ly<sh-S*2;ly++){const r=Math.max(0,Math.floor((sh-ly-S*2)*.5)-1);for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++) if(Math.abs(dx)+Math.abs(dz)<=r+1) world.setVoxel(bx+dx,by+S*2+ly,bz+dz,VT.PINE);}
}

export function populateWorld(world) {
  const interactables = [];

  // Town square
  for(let dx=-S*14;dx<=S*14;dx++) for(let dz=-S*14;dz<=S*14;dz++){
    const d=Math.abs(dx)+Math.abs(dz);
    if(d<=S*8||(Math.abs(dx)<=S*2&&Math.abs(dz)<=S*12)||(Math.abs(dx)<=S*12&&Math.abs(dz)<=S*2)){
      const by=world.getSurfaceY(CX+dx,CZ+dz);
      world.setVoxel(CX+dx,by,CZ+dz,d<=S*5?VT.COBBLE:VT.PATH);
    }
  }

  // Fountain
  {const by=world.getSurfaceY(CX,CZ);
  for(let dx=-S*2;dx<=S*2+S-1;dx++) for(let dz=-S*2;dz<=S*2+S-1;dz++){
    const e=Math.abs(dx)>=S*2||Math.abs(dz)>=S*2;
    world.setVoxel(CX+dx,by+1,CZ+dz,e?VT.STONE:VT.WATER);
    if(e)world.setVoxel(CX+dx,by+2,CZ+dz,VT.STONE);
  }
  world.setVoxel(CX,by+3,CZ,VT.STONE);
  world.setVoxel(CX,by+1,CZ-S*3,VT.LANTERN);}

  // Buildings
  house(world,-24,-19,VT.YELLOW_WALL,VT.RED_ROOF,{w:7,d:5,ht:4});
  house(world,9,-19,VT.WHITE_WALL,VT.RED_ROOF,{w:7,d:5,ht:4});
  house(world,-24,-33,VT.CREAM_WALL,VT.DARK_ROOF,{w:8,d:6,ht:4});
  house(world,8,-33,VT.YELLOW_WALL,VT.DARK_ROOF,{w:7,d:5,ht:4});
  house(world,-6,-37,VT.WHITE_WALL,VT.RED_ROOF,{w:6,d:5,ht:4});
  house(world,-20,-42,VT.CREAM_WALL,VT.RED_ROOF,{w:7,d:5,ht:4,solar:true});
  house(world,12,-42,VT.YELLOW_WALL,VT.BROWN_ROOF,{w:8,d:5,ht:4});
  house(world,-30,-17,VT.ORANGE_WALL,VT.BROWN_ROOF,{w:10,d:8,ht:5,solar:true}); // Bakery
  house(world,24,-17,VT.WHITE_WALL,VT.RED_ROOF,{w:9,d:7,ht:5});                 // Post Office
  house(world,36,16,VT.PURPLE_WALL,VT.DARK_ROOF,{w:13,d:10,ht:6,twoStory:true}); // Library
  house(world,-40,16,VT.GREY_WALL,VT.DARK_ROOF,{w:12,d:10,ht:5,solar:true});    // Workshop
  house(world,-16,-32,VT.CREAM_WALL,VT.BROWN_ROOF,{w:12,d:9,ht:5,twoStory:true}); // Pub
  house(world,17,-31,VT.WHITE_WALL,VT.DARK_ROOF,{w:14,d:10,ht:5});              // School
  house(world,-5,-27,VT.CREAM_WALL,VT.RED_ROOF,{w:10,d:7,ht:4});               // Café
  house(world,32,22,VT.TEAL_WALL,VT.TEAL_WALL,{w:9,d:7,ht:4});                 // Greenhouse
  house(world,-32,22,VT.GREY_WALL,VT.RED_ROOF,{w:8,d:7,ht:4});                 // General Store

  // Register interactables for each named building
  for(const[label,area]of Object.entries(AREAS)){
    interactables.push({ pos:[area.x*S+CX, 0, area.z*S+CZ], type:label.toLowerCase(), label:area.label });
  }

  // Paths
  path(world,0,-12,0,-42,3,VT.COBBLE); path(world,0,12,0,66,3,VT.PATH); path(world,0,66,0,98,2,VT.PATH);
  path(world,-10,0,-80,36,2,VT.PATH); path(world,10,0,62,26,2,VT.PATH);
  path(world,-10,-12,-30,-17,2,VT.PATH); path(world,10,-12,24,-17,2,VT.PATH);
  path(world,-12,8,-40,16,2,VT.PATH); path(world,12,8,36,16,2,VT.PATH);
  path(world,-8,-24,-16,-32,2,VT.PATH); path(world,8,-24,17,-31,2,VT.PATH);

  // Dock
  {const by=SEA_LEVEL;
  for(let dz=0;dz<S*28;dz++){for(let dx=-S*2;dx<=S*3;dx++) world.setVoxel(CX+dx,by,CZ+S*100+dz,VT.DOCK);
  if(dz%S===0){world.setVoxel(CX-S*2,by-1,CZ+S*100+dz,VT.WOOD);world.setVoxel(CX+S*3,by-1,CZ+S*100+dz,VT.WOOD);}
  if(dz>0&&dz<S*27){world.setVoxel(CX-S*2,by+1,CZ+S*100+dz,VT.METAL);world.setVoxel(CX+S*3,by+1,CZ+S*100+dz,VT.METAL);}}}
  house(world,-6,90,VT.DOCK,VT.BROWN_ROOF,{w:8,d:6,ht:3});

  // Trees — forest NE
  for(let i=0;i<100;i++){
    const a=(Math.random()-.5)*1.9+0.4, r=42+Math.random()*82;
    const tx=Math.cos(a)*r, tz=Math.sin(a)*r;
    if(sY(world,tx,tz)>SEA_LEVEL+S*2) Math.random()<.3?treePine(world,tx,tz,10+Math.floor(Math.random()*6)):treeOak(world,tx,tz,8+Math.floor(Math.random()*5));
  }
  // Mountain foothills pines
  for(let i=0;i<40;i++){
    const tx=-46+(Math.random()-.5)*28, tz=-82+(Math.random()-.5)*28;
    if(sY(world,tx,tz)>SEA_LEVEL+S*6) treePine(world,tx,tz,11+Math.floor(Math.random()*6));
  }
  // Scattered
  for(let i=0;i<80;i++){
    const a=Math.random()*Math.PI*2, r=18+Math.random()*90;
    const tx=Math.cos(a)*r, tz=Math.sin(a)*r;
    if(sY(world,tx,tz)>SEA_LEVEL+S*2) treeOak(world,tx,tz,7+Math.floor(Math.random()*4));
  }

  // Flowers
  const flrs=[VT.FLOWER_R,VT.FLOWER_Y,VT.FLOWER_P,VT.FLOWER_W];
  for(let i=0;i<300;i++){
    const a=Math.random()*Math.PI*2, r=6+Math.random()*100;
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    const bx=Math.round(CX+lx*S), bz2=Math.round(CZ+lz*S);
    const by=world.getSurfaceY(bx,bz2);
    const t=world.getVoxel(bx,by,bz2);
    if(by>SEA_LEVEL+1&&(t===VT.GRASS||t===VT.GRASS_DARK))
      world.setVoxel(bx,by+1,bz2,flrs[Math.floor(Math.random()*4)]);
  }

  // Farm crop rows
  for(let fdx=-108;fdx<-60;fdx+=2) for(let fdz=30;fdz<64;fdz+=2){
    const bx=Math.round(CX+fdx*S), bz2=Math.round(CZ+fdz*S);
    const by=world.getSurfaceY(bx,bz2);
    if(by>SEA_LEVEL+1){world.setVoxel(bx,by,bz2,VT.FARM_SOIL);if(Math.random()<.7)world.setVoxel(bx,by+1,bz2,fdz<46?VT.CROP_GREEN:VT.CROP_GOLD);}
  }

  return interactables;
}
