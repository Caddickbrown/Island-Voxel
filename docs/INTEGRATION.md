# Integration roadmap: Island → Island-Voxel

A comparison of the original [Island](https://github.com/Caddickbrown/Island) prototype
(Three.js, flat heightmap terrain) with this voxel engine, and a recommended order for
porting the remaining systems.

## Already ported

| System | Island | Island-Voxel |
|---|---|---|
| NPCs, schedules, dialogue | `npcs.js` | `engine/npc.js`, `game/npcs.js` (22 NPCs) |
| Named areas / town layout | `scene.js` | `game/island.js` (`AREAS`, `populateWorld`) |
| Day/night cycle | `scene.js` | `engine/daynight.js` (sky, clouds, stars) |
| Wildlife | `animals.js` | `engine/entities.js` (seagulls, sheep, deer, whale, boats) |
| Water | `scene.js` | `engine/water.js` (GPU shader water) |
| Player controller | `player.js` | `engine/player.js` (voxel physics, step-up, touch/gamepad) |

## Not yet ported — recommended order

### 1. Control polish (small, immediate feel win)
Old `player.js` has two things the voxel controller lacks:
- **Jump-hold boost** — base impulse plus extra lift for up to 0.25 s while the button is
  held (`JUMP_HOLD_BOOST`). Drops straight into `Player.update()`; needs
  `input.isDown('jump')` which already exists.
- **Camera bob** — subtle `sin(bobTime)` vertical oscillation while walking. Add to the
  camera block in `engine/player.js`, driven by horizontal speed.

### 2. Save system (`save.js`)
Single-key localStorage snapshot (`island_save_v1`, versioned JSON) bundling player
position, game hour, and every module's state, with a daily auto-save and HUD indicator.
Port the shell first with just `{ position, gameHour }`:
- save: player position from `Player.position`, hour from `DayNight.gameTime`
- restore: `Player.spawnAt()` + a `DayNight` time setter
- the module-state bundle grows naturally as each system below lands.

### 3. Bag + beachcombing (`bag.js`, `beachcombing.js`)
Shells / sea glass / driftwood spawn in beach zones (max 12 live items, 60 s respawn),
picked up via E within ~4 units, stored in a bag. Fits the voxel engine well:
- spawn zones can come from the beach biome in `engine/terrain.js` instead of
  hard-coded circles
- pickup hooks into the existing interact path in `index.html` (it already resolves
  `input.wasPressed('interact')` → nearest NPC; extend to nearest item)
- item meshes are simple primitives, same style as `engine/entities.js`.

### 4. Journal + milestones (`journal.js`, `milestones.js`)
Journal: localStorage-backed entry log (typed entries, toast on add, J-key modal panel,
capped at 100). Layer it over dialogue and beachcombing so first-time events
("first shell", "met Mabel") write entries. Pure DOM/localStorage — ports with almost
no engine coupling.

### 5. Relationships + NPC memory (`relationships.js`, `npc_memory.js`)
Friendship levels and remembered interactions per NPC. Hooks into
`NPC.getDialogue()` (`engine/npc.js`) to vary lines by relationship tier. Port after
the journal so progress is visible to the player.

### 6. Minigames, radio, sleep (largest lifts)
`fishing.js` first — the harbour, boats, and water already exist here, and it reuses
bag + journal. Bakery/cafe/kart depend on interior spaces, which voxel buildings don't
have yet. `radio.js` (ambient music zones) and `sleep.js` (time skip) are small but
depend on the save system for the time-of-day write-back.

## Porting notes

- The old project measures distances in world units on a 600×600 island; this engine
  uses voxel coords × `VS` (0.5). Multiply old tuning constants (pickup radii, zone
  sizes) by `VS` rather than copying them.
- Old code reads terrain height via `getHeight(x, z)`; the equivalent here is
  `world.getSurfaceY(vx, vz) * VS`.
- UI in the old project is plain DOM injected per module — the same pattern as the
  HUD in `index.html`, so modules can port UI-as-is with minor CSS reconciliation.
