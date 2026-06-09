// engine/chunkloader.js — Manages chunk meshing pipeline with Web Worker pool
import { CHUNK_SIZE } from './world.js';
import { buildChunkMesh } from './mesher.js'; // fallback if workers unavailable

const WORKER_COUNT = Math.min(4, navigator.hardwareConcurrency || 2);

export class ChunkLoader {
  constructor(world, renderer) {
    this._world    = world;
    this._renderer = renderer;
    this._queue    = []; // { cx, cy, cz, lod, key, priority } — rebuilt on rescan, never duplicated
    this._inFlight = new Set(); // "cx,cy,cz" keys currently being meshed
    this._loaded   = new Map(); // key → lod that was last meshed
    this._reqId    = 0;
    this._workers  = [];
    this._freeWorkers = [];
    // Last rescan state — wanted chunks only change when the player crosses
    // a chunk boundary, so skip the range scan + sort on most frames.
    this._lastPcx = null;
    this._lastPcz = null;
    this._lastViewDist = 0;

    // Try to spin up workers; fall back to sync meshing
    try {
      for (let i = 0; i < WORKER_COUNT; i++) {
        const w = new Worker('./engine/mesher.worker.js', { type: 'module' });
        w.onmessage = e => this._onWorkerDone(w, e.data);
        w.onerror   = () => console.warn('Worker error, falling back to sync');
        this._workers.push(w);
        this._freeWorkers.push(w);
      }
    } catch {
      console.warn('Web Workers unavailable — meshing on main thread');
    }
  }

  _key(cx,cy,cz) { return `${cx},${cy},${cz}`; }

  // Called every frame from the game loop.
  // playerWX/WZ in voxel coords, viewDist in chunks.
  tick(playerWX, playerWZ, viewDist = 8) {
    const C = CHUNK_SIZE;
    const pcx = Math.floor(playerWX / C), pcz = Math.floor(playerWZ / C);

    // World edits invalidate meshed chunks — drop them from loaded so the
    // rescan below requeues them. (Never-meshed chunks always mesh fresh
    // data, so their dirty flags can simply be cleared.)
    const dirty = this._world.dirtyMesh;
    if (dirty.size > 0) {
      for (const k of dirty) this._loaded.delete(k);
      dirty.clear();
      this._lastPcx = null; // force rescan
    }

    if (pcx !== this._lastPcx || pcz !== this._lastPcz || viewDist !== this._lastViewDist) {
      this._lastPcx = pcx; this._lastPcz = pcz; this._lastViewDist = viewDist;

      const wanted = this._world.getChunksInRange(playerWX, playerWZ, viewDist);
      const wantedSet = new Set();
      for (const c of wanted) wantedSet.add(this._key(c.cx, c.cy, c.cz));

      // Remove chunks no longer in range
      for (const key of this._renderer.chunkMeshes.keys()) {
        if (!wantedSet.has(key)) this._renderer.removeChunkMesh(key);
      }
      for (const key of this._loaded.keys()) {
        if (!wantedSet.has(key)) this._loaded.delete(key);
      }

      // Rebuild the queue from scratch — no duplicates possible
      const queue = [];
      for (const c of wanted) {
        const k = this._key(c.cx, c.cy, c.cz);
        if (this._loaded.get(k) === c.lod) continue; // already meshed at this LOD
        if (this._inFlight.has(k)) continue;
        queue.push({ cx:c.cx, cy:c.cy, cz:c.cz, lod:c.lod, key:k, priority:c.dist });
      }
      queue.sort((a,b) => a.priority - b.priority);
      this._queue = queue;
    }

    this._dispatch();
  }

  _dispatch() {
    while (this._queue.length > 0) {
      const job = this._queue[0];
      const k   = job.key;

      if (this._inFlight.has(k) || this._loaded.get(k) === job.lod) {
        this._queue.shift();
        continue;
      }

      // All-air chunks need no mesh at all — most of the sky resolves here
      if (this._world.isChunkEmpty(job.cx, job.cy, job.cz)) {
        this._queue.shift();
        this._renderer.removeChunkMesh(k);
        this._loaded.set(k, job.lod);
        continue;
      }

      if (this._workers.length > 0) {
        if (this._freeWorkers.length === 0) break; // all busy
        const w = this._freeWorkers.pop();
        this._queue.shift();
        this._submitToWorker(w, job);
      } else {
        // Sync fallback — do one chunk per tick to avoid stalling
        this._queue.shift();
        this._meshSync(job);
        break;
      }
    }
  }

  _submitToWorker(worker, job) {
    const { cx, cy, cz, lod } = job;
    const k = this._key(cx, cy, cz);
    this._inFlight.add(k);
    const { data, nbrs } = this._world.getChunkWithNeighbours(cx, cy, cz);

    // Clone data for transfer
    const cloned = new Uint8Array(data);
    const nbrsClone = {};
    for (const [nk, nd] of Object.entries(nbrs)) {
      if (nd) nbrsClone[nk] = new Uint8Array(nd);
    }

    worker._currentKey = k;
    worker.postMessage({
      type: 'mesh', chunkData: cloned, cx, cy, cz,
      neighbourData: nbrsClone, lod, reqId: ++this._reqId,
    }, [cloned.buffer]);
  }

  _onWorkerDone(worker, msg) {
    const k = worker._currentKey;
    this._inFlight.delete(k);
    this._freeWorkers.push(worker);
    if (msg.type === 'done') {
      this._renderer.addChunkMesh(k, msg, msg.lod);
      this._loaded.set(k, msg.lod);
    }
    this._dispatch();
  }

  _meshSync({ cx, cy, cz, lod }) {
    const k = this._key(cx, cy, cz);
    this._inFlight.add(k);
    const { data, nbrs } = this._world.getChunkWithNeighbours(cx, cy, cz);
    const result = buildChunkMesh(data, cx, cy, cz, nbrs, lod);
    this._renderer.addChunkMesh(k, result, lod);
    this._loaded.set(k, lod);
    this._inFlight.delete(k);
  }

  // Force immediate (sync) load of nearby chunks for initial spawn.
  // Re-meshes chunks dirtied by world edits (e.g. building placement).
  preloadSync(playerWX, playerWZ, radius = 3) {
    const dirty = this._world.dirtyMesh;
    const chunks = this._world.getChunksInRange(playerWX, playerWZ, radius);
    for (const c of chunks) {
      const k = this._key(c.cx, c.cy, c.cz);
      if (this._loaded.has(k) && !dirty.has(k)) continue;
      dirty.delete(k);
      if (this._world.isChunkEmpty(c.cx, c.cy, c.cz)) {
        this._renderer.removeChunkMesh(k);
        this._loaded.set(k, 0);
        continue;
      }
      this._meshSync({ cx:c.cx, cy:c.cy, cz:c.cz, lod: 0 });
    }
    this._lastPcx = null; // ensure next tick rescans against preloaded state
  }
}
