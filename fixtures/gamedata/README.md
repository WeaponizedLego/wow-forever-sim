# Game data fixtures

Owned by lane L6 (`packages/gamedata`). Tests decode these instead of fetching live data.

| File              | What                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `db.bin`          | `UIDatabase` (binary proto): items, enchants, consumables, zones, NPCs, …                 |
| `leftover_db.bin` | `UIDatabase` with the items upstream ships separately (plus a few enchants, factions)     |
| `sv-request.json` | The engine's `RaidSimRequest` for upstream's Survival Hunter `sv.siml` preset (protojson) |

## Provenance

Copied unchanged from [wowsims/forever](https://github.com/wowsims/forever) (MIT) at the commit in
`engine.lock.json`, files `assets/database/db.bin` and `assets/database/leftover_db.bin`. They are the
same files as the engine release, so their sha256 is the lock's `artifacts.db.sha256` and
`artifacts.leftoverDb.sha256`.

`sv-request.json` is built by `tools/engine-build/spike/request-builder` (the CLI's own preset loader) at the
same commit. `character.test.ts` and `request.test.ts` rebuild it from the "sv" preset in `data/presets`, so it
must come from the same commit as the presets. (`fixtures/engine/sv-raidsim-request.json` is the Phase 0 capture
at `b2047bf`, kept with its result for the engine tests.)

Upstream merges the two the same way `loadDatabase(main, leftover)` does
(`assets/database/loader.go`: `proto.Merge`, which appends every repeated field).

engine-sync's `promote.mjs` copies the databases and rebuilds `sv-request.json` on every engine bump, together with the spec presets that
point at their items (see `tools/engine-build/README.md`). To refresh by hand: copy both files from
the pinned commit and rerun `corepack pnpm@12.18.0 exec vitest run --project gamedata`.
