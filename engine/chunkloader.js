// engine/chunkloader.js — Manages chunk meshing pipeline with Web Worker pool
import { CHUNK_SIZE } from './world.js';
import { buildChunkMesh } from './mesher.js'; // fallback if workers unavailable

const WORKER_COUNT = Math.min(4, navigator.hardwareConcurrency ?? 2);

export class ChunkLoader {
  constructor(world, renderer) {
    this._world    = world;
    this._renderer = renderer;
    this._queue    = []; // { cx, cy, cz, lod, priority }
    this._inFlight = new Set(); // "cx,cy,cz" keys currently being meshed
    this._loaded   = new Map(); // key → lod that was last meshed
    this._reqId    = 0;
    this._workers  = [];
    this._freeWorkers = [];

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
    const wanted = this._world.getChunksInRange(playerWX, playerWZ, viewDist);

    // Build set of wanted keys
    const wantedSet = new Set();
    for (const c of wanted) wantedSet.add(this._key(c.cx, c.cy, c.cz));

    // Remove chunks no longer in range
    for (const [key] of this._renderer.chunkMeshes) {
      if (!wantedSet.has(key)) this._renderer.removeChunkMesh(key);
    }
    for (const key of this._loaded.keys()) {
      if (!wantedSet.has(key)) this._loaded.delete(key);
    }

    // Queue chunks that need (re)meshing
    for (const c of wanted) {
      const k = this._key(c.cx, c.cy, c.cz);
      const existing = this._loaded.get(k);
      if (existing === c.lod) continue; // already meshed at this LOD
      if (this._inFlight.has(k)) continue;
      this._queue.push({ ...c, priority: c.dist });
    }

    // Sort by distance (closest first)
    this._queue.sort((a,b) => a.priority - b.priority);

    // Dispatch up to available workers (or process sync if no workers)
    this._dispatch();
  }

  _dispatch() {
    while (this._queue.length > 0) {
      const job = this._queue[0];
      const k   = this._key(job.cx, job.cy, job.cz);

      if (this._inFlight.has(k)) { this._queue.shift(); continue; }

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

  // Force immediate (sync) load of nearby chunks for initial spawn
  preloadSync(playerWX, playerWZ, radius = 3) {
    const chunks = this._world.getChunksInRange(playerWX, playerWZ, radius);
    for (const c of chunks) {
      const k = this._key(c.cx, c.cy, c.cz);
      if (!this._loaded.has(k)) this._meshSync({ ...c, lod: 0 });
    }
  }
}
