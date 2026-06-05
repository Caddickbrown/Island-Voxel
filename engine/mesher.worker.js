// engine/mesher.worker.js — Web Worker wrapper for the chunk mesher
// Loaded via: new Worker('./engine/mesher.worker.js', { type: 'module' })

import { buildChunkMesh } from './mesher.js';

self.onmessage = function(e) {
  const { type, chunkData, cx, cy, cz, neighbourData, lod, reqId } = e.data;
  if (type !== 'mesh') return;

  const result = buildChunkMesh(chunkData, cx, cy, cz, neighbourData, lod);

  // Transfer typed arrays to avoid copy
  const transferList = [
    result.opaque.positions.buffer,
    result.opaque.normals.buffer,
    result.opaque.colors.buffer,
    result.opaque.indices.buffer,
    result.glass.positions.buffer,
    result.glass.normals.buffer,
    result.glass.colors.buffer,
    result.glass.indices.buffer,
  ];

  self.postMessage({
    type: 'done',
    cx, cy, cz, lod, reqId,
    opaque: result.opaque,
    glass:  result.glass,
  }, transferList);
};
