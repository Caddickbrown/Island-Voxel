# Island Voxel Engine

A browser-based voxel game engine built for [Island](https://github.com/Caddickbrown/Island) — a cosy third-person walking simulator in the spirit of Alba: A Wildlife Adventure.

## Architecture

```
engine/
  world.js       — Chunk manager, world gen, voxel get/set, dirty tracking
  terrain.js     — Heightmap + zone/biome generation (Perlin fbm)
  mesher.js      — Chunk mesher with vertex AO + smooth terrain normals
  mesher.worker.js — Web Worker wrapper around the mesher
  chunkloader.js — Chunk streaming pipeline (worker pool, LOD, dirty re-mesh)
  renderer.js    — Three.js scene, chunk mesh lifecycle, pooled lantern lights
  player.js      — Third-person controller, physics, collision
  entities.js    — Wildlife (seagulls, sheep, deer, whale, boats)
  npc.js         — Schedule-driven NPCs with labels and dialogue
  water.js       — GPU shader water (no CPU vertex updates)
  daynight.js    — Sky, lighting, clouds, time of day
  input.js       — Keyboard/mouse/touch/gamepad unified input
game/
  island.js      — Island world definition, area placement
  npcs.js        — Island NPC schedules (ported from Island)
index.html       — Entry point
```

## Design principles

- **Chunked** — 32×32×32 voxel chunks. Only mesh chunks within view distance.
- **Column-cached worldgen** — heights/biomes computed once per chunk column and
  shared by all six vertical slabs; all-air chunks share a single zeroed buffer.
- **Frustum culled** — per-mesh bounding spheres, via three.js built-in culling.
- **LOD** — near chunks full-res, far chunks silhouette only.
- **Worker meshing** — mesh generation off the main thread; empty chunks skipped.
- **Shader water** — vertex displacement in GLSL, zero CPU cost per frame.
- **Fixed light budget** — a pool of 6 point lights follows the player between
  lantern spots at night, so shaders compile once and stay small.
- **Alba-scale physics** — gravity, step-up, slope walking. No rigid body solver needed.

## Running

Serve the repo root over HTTP (workers don't run from `file://`):

```
npx serve .        # or: python3 -m http.server
```

then open `index.html`. Three.js is loaded from a CDN import map.

## Status

🚧 Playable walking sim: streamed island terrain with snow-capped mountain, town
and harbour, day/night cycle with clouds and stars, 22 schedule-driven NPCs with
dialogue, wildlife, and keyboard/mouse/touch/gamepad input. Start/pause menu
(Esc / Start / ⚙) with an invert-camera-Y option, persisted across sessions.
