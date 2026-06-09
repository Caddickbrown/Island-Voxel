// engine/mesher.js — Chunk mesher with vertex AO + smooth terrain normals

export const CHUNK_SIZE = 32;

export const VCOLOR = [
  0x000000,0x6ab04c,0x8b6f47,0x8a949c,0xe8d5a3,0x2e8db5,0x16496a,
  0xeef2f8,0x6e7880,0x3d6b42,0x9a8878,0x4a8a30,0x8fb84a,0xc4b47c,
  0x7a4e18,0x2eb84a,0x1a7832,0xd4880a,0x2a6028,0x30c060,
  0xf0ece4,0xfde8c9,0xffeaa7,0xe17055,0xa29bfe,0x2d9e8f,0xb2bec3,
  0xb06040,0xd63031,0x4a2a10,0x8b4a18,0x909898,
  0xc8a050,0x4a2c20,0xa8d4f8,0x2d3436,0x3c1e00,0x50b878,0xd4b822,
  0xb89e5c,0x787068,0x6a4810,0x808888,0x9e8a6e,0x95a5a6,0xf8c040,
  0xe74c3c,0xf1c40f,0x9b59b6,0xffffff,0xe8400a,0x5a8a40,
  0x5a6068,0x4ebccc,0x636e72,0x88c8f8,0xf5f0e0,
];

const FACES = [
  {dir:[1,0,0],  norm:[1,0,0],  c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
  {dir:[-1,0,0], norm:[-1,0,0], c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
  {dir:[0,1,0],  norm:[0,1,0],  c:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
  {dir:[0,-1,0], norm:[0,-1,0], c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
  {dir:[0,0,1],  norm:[0,0,1],  c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},
  {dir:[0,0,-1], norm:[0,0,-1], c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]},
];

const TERRAIN_T = new Set([1,2,3,4,7,8,9,10,11,12,13,52]);
const TRANSP    = new Set([0,5,6,46,47,48,49,50,51,45,53]);
const GLASS     = new Set([34,55]);

const isT = t => TRANSP.has(t);
const isG = t => GLASS.has(t);
const isSolAO = t => t!==0 && !TRANSP.has(t) && !GLASS.has(t);

function cHash(x,y,z) {
  let h=(x*1619^y*31337^z*6971)&0x7fffffff;
  h=(h^h>>13)*0x45d9f3b; h=(h^h>>15)&0x7fffffff;
  return h/0x7fffffff*2-1;
}

function gL(data, nbrs, lx, ly, lz) {
  const C=CHUNK_SIZE;
  if(lx>=0&&lx<C&&ly>=0&&ly<C&&lz>=0&&lz<C)
    return data[lx+lz*C+ly*C*C];
  const nx=lx<0?-1:lx>=C?1:0, ny=ly<0?-1:ly>=C?1:0, nz=lz<0?-1:lz>=C?1:0;
  const nd=nbrs[`${nx},${ny},${nz}`];
  if(!nd) return 0;
  const rlx=((lx%C)+C)%C, rly=((ly%C)+C)%C, rlz=((lz%C)+C)%C;
  return nd[rlx+rlz*C+rly*C*C];
}

function vAO(data, nbrs, fx, fy, fz, cx2, cy2, cz2, nx, ny, nz) {
  const dx=cx2===0?-1:1, dy=cy2===0?-1:1, dz=cz2===0?-1:1;
  let s1,s2,corner;
  if(nx!==0){ s1=isSolAO(gL(data,nbrs,fx,fy+dy,fz))?1:0; s2=isSolAO(gL(data,nbrs,fx,fy,fz+dz))?1:0; corner=isSolAO(gL(data,nbrs,fx,fy+dy,fz+dz))?1:0; }
  else if(ny!==0){ s1=isSolAO(gL(data,nbrs,fx+dx,fy,fz))?1:0; s2=isSolAO(gL(data,nbrs,fx,fy,fz+dz))?1:0; corner=isSolAO(gL(data,nbrs,fx+dx,fy,fz+dz))?1:0; }
  else{ s1=isSolAO(gL(data,nbrs,fx+dx,fy,fz))?1:0; s2=isSolAO(gL(data,nbrs,fx,fy+dy,fz))?1:0; corner=isSolAO(gL(data,nbrs,fx+dx,fy+dy,fz))?1:0; }
  return 1-(s1+s2+corner)*0.27;
}

function tNorm(data, nbrs, lx, lz) {
  // Approximate smooth normal from height difference with neighbours
  const C=CHUNK_SIZE;
  function topY(dlx, dlz) {
    for(let y=C-1;y>=0;y--) if(isSolAO(gL(data,nbrs,lx+dlx,y,lz+dlz))) return y;
    return 0;
  }
  const nx=(topY(-1,0)-topY(1,0))*.35, nz=(topY(0,-1)-topY(0,1))*.35, ny=1;
  const l=Math.sqrt(nx*nx+ny*ny+nz*nz);
  return [nx/l, ny/l, nz/l];
}

/**
 * buildChunkMesh(chunkData, cx, cy, cz, neighbourData, lod)
 * Returns { opaque: {positions,normals,colors,indices}, glass: {...} }
 * Positions are in world-voxel coords (multiply by VS in renderer).
 */
export function buildChunkMesh(chunkData, cx, cy, cz, neighbourData={}, lod=0) {
  const C=CHUNK_SIZE;
  const ox=cx*C, oy=cy*C, oz=cz*C;
  const op={pos:[],nrm:[],col:[],idx:[],vi:0};
  const gl={pos:[],nrm:[],col:[],idx:[],vi:0};

  for(let ly=0;ly<C;ly++) for(let lz=0;lz<C;lz++) for(let lx=0;lx<C;lx++) {
    const type=gL(chunkData,neighbourData,lx,ly,lz);
    if(type===0) continue;
    // LOD2: silhouette — only top-exposed faces
    if(lod>=2 && gL(chunkData,neighbourData,lx,ly+1,lz)!==0) continue;

    const glass=isG(type), buf=glass?gl:op;
    const hex = VCOLOR[type] !== undefined ? VCOLOR[type] : 0x888888;
    let r=((hex>>16)&0xff)/255, g2=((hex>>8)&0xff)/255, b=(hex&0xff)/255;
    const vary=cHash(ox+lx,oy+ly,oz+lz)*0.08;
    r=Math.max(0,Math.min(1,r+vary*r)); g2=Math.max(0,Math.min(1,g2+vary*g2)); b=Math.max(0,Math.min(1,b+vary*b));

    const faceset = lod>=2 ? [FACES[2]] : FACES;
    for(const f of faceset) {
      const[nx2,ny2,nz2]=f.dir;
      const nbr=gL(chunkData,neighbourData,lx+nx2,ly+ny2,lz+nz2);
      if(!isT(nbr)&&!isG(nbr)) continue;
      if((type===5||type===53)&&nbr===type) continue;
      if(type===6&&nbr===6) continue;
      if(glass&&nbr===type) continue;

      let fnx=f.norm[0],fny=f.norm[1],fnz=f.norm[2];
      if(ny2===1&&TERRAIN_T.has(type))[fnx,fny,fnz]=tNorm(chunkData,neighbourData,lx,lz);

      const ao=f.c.map(([cx3,cy3,cz3])=>vAO(chunkData,neighbourData,lx+nx2,ly+ny2,lz+nz2,cx3,cy3,cz3,nx2,ny2,nz2));
      const bvi=buf.vi;
      for(let i=0;i<4;i++) {
        const[cx3,cy3,cz3]=f.c[i],a=ao[i];
        buf.pos.push(ox+lx+cx3, oy+ly+cy3, oz+lz+cz3);
        buf.nrm.push(fnx,fny,fnz);
        buf.col.push(r*a,g2*a,b*a);
        buf.vi++;
      }
      if(ao[0]+ao[2]>ao[1]+ao[3]) buf.idx.push(bvi,bvi+1,bvi+2,bvi,bvi+2,bvi+3);
      else buf.idx.push(bvi+1,bvi+2,bvi+3,bvi,bvi+1,bvi+3);
    }
  }

  const pack=b=>({
    positions: new Float32Array(b.pos),
    normals:   new Float32Array(b.nrm),
    colors:    new Float32Array(b.col),
    indices:   new Uint32Array(b.idx),
  });
  return { opaque: pack(op), glass: pack(gl) };
}
