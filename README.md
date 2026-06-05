# Island Voxel Engine

A browser-based voxel game engine built for [Island](https://github.com/Caddickbrown/Island) — a cosy third-person walking simulator in the spirit of Alba: A Wildlife Adventure.

## Architecture

```
engine/
  world.js       — Chunk manager, world gen, voxel get/set
  mesher.js      — Greedy mesher with AO, runs in Web Worker
  renderer.js    — Three.js scene, LOD, frustum culling
  terrain.js     — Heightmap + biome generation (Perlin fbm)
  player.js      — Third-person controller, physics, collision
  entities.js    — NPC/wildlife base class + update loop
  water.js       — GPU shader water (no CPU vertex updates)
  daynight.js    — Sky, lighting, time of day
  input.js       — Keyboard/mouse/touch/gamepad unified input
  audio.js       — Positional audio, ambient soundscape
game/
  island.js      — Island world definition, area placement
  npcs.js        — Island NPC schedules (ported from Island)
  minigames.js   — Minigame registry
index.html       — Entry point
```

## Design principles

- **Chunked** — 32×32×32 voxel chunks. Only mesh chunks within view distance.
- **Frustum culled** — chunks outside camera frustum skipped entirely.
- **LOD** — near chunks full-res, mid chunks merged, far chunks silhouette only.
- **Worker meshing** — greedy mesh generation off the main thread.
- **Shader water** — vertex displacement in GLSL, zero CPU cost per frame.
- **Hybrid rendering** — voxel terrain + smooth mesh buildings/characters blended naturally.
- **Alba-scale physics** — gravity, step-up, slope walking. No rigid body solver needed.

## Status

🚧 Engine in active development. World generation and rendering working. Player controller in progress.
