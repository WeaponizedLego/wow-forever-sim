# Game data fixtures

Owned by lane L6 (`packages/gamedata`). Tests decode these instead of fetching live data.

| File              | What                                                                                       | sha256                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `db.bin`          | `UIDatabase` (binary proto): 7,212 items, 248 enchants, 431 consumables, zones, NPCs, …    | `ae359165a955a8dad982390a9fe8bd3f445b6204e9bbf97535f334252d6fec2f` |
| `leftover_db.bin` | `UIDatabase` with the items upstream ships separately (3,730 items, 20 enchants, factions) | `9ed595c48319de03401447e4f8556f449708e009d6c555c7b31b113a18a0e9b2` |

## Provenance

Copied unchanged from [wowsims/forever](https://github.com/wowsims/forever) (MIT) at the pinned
commit in `engine.lock.json`: `b2047bfe4cf000e64c223eefcab016b411214380`, files
`assets/database/db.bin` and `assets/database/leftover_db.bin`.

Upstream merges the two the same way `loadDatabase(main, leftover)` does
(`assets/database/loader.go`: `proto.Merge`, which appends every repeated field).

To refresh: copy both files from the new pinned commit, update the hashes above, and rerun
`corepack pnpm@12.18.0 exec vitest run --project gamedata`.
