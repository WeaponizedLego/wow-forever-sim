# Game data fixtures

Owned by lane L6 (`packages/gamedata`). Tests decode these instead of fetching live data.

| File              | What                                                                                       | sha256                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `db.bin`          | `UIDatabase` (binary proto): 7,476 items, 248 enchants, 431 consumables, zones, NPCs, …    | `6ca01e7d3f04874a3390a4a7be6eb2d7215764cd1df6f788147b134689178830` |
| `leftover_db.bin` | `UIDatabase` with the items upstream ships separately (3,731 items, 20 enchants, factions) | `cb57592ec76e6fd2ec8ed2d05926b6e571c4345427c4baad416a6f5fbaccfdfb` |

## Provenance

Copied unchanged from [wowsims/forever](https://github.com/wowsims/forever) (MIT) at the pinned
commit in `engine.lock.json`: `540ad8fca3fd367c5f780972f43d65af858bcef7`, files
`assets/database/db.bin` and `assets/database/leftover_db.bin`.

Upstream merges the two the same way `loadDatabase(main, leftover)` does
(`assets/database/loader.go`: `proto.Merge`, which appends every repeated field).

To refresh: copy both files from the new pinned commit, update the hashes above, and rerun
`corepack pnpm@12.18.0 exec vitest run --project gamedata`.
