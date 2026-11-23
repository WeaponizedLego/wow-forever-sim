# Fixtures

Captured from the real engine (upstream `b2047bf`) in the Phase 0 spike. Lanes test against these
instead of a live engine.

| File                                 | What                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/sv-raidsim-request.json`     | Survival Hunter preset (`ui/specs/hunter/dps/builds/sv.siml`), 5,000 iterations, seed 0x5F1A, `saveAllValues`, `debugFirstIteration`, full per-player `SimDatabase` |
| `engine/sv-raidsim-result.json`      | Its result from the WASM build in Node: 850.20 DPS, σ 28.68, `allValues`, `hist`, iteration-1 `logs`                                                                |
| `engine/sv-statweights-request.json` | Stat weights for the same player: Str, Agi, AP, RAP; 2,000 iterations                                                                                               |
| `engine/sv-statweights-result.json`  | Its result (native Go build)                                                                                                                                        |

All are protojson. Parse with `RaidSimResult.fromJson(...)` from `@fsim/proto`.

The results are frozen samples for the code that reads results (`packages/analysis`, `packages/proto`), not what
today's engine returns: upstream retunes the sim between engine syncs (the same request gave 849.44 DPS at
`132a66a`). The real-WASM tests in `packages/engine` therefore hold the engine to the capture's range only, and
check exactness against the engine's own runs.

`engine/action-ids.json` is not protojson: the action ids (`spell:1680#14`, …) that the DPS Warrior presets and the
Wowhead-imported Hunter (`import/real/wowhead-forever-sv-hunter.url`) report in the locked engine, split into damage
rows, player auras and everything else. `packages/gamedata/src/action-names.test.ts` names them offline;
`packages/engine/src/action-names.test.ts` sims the runs in the staged engine and rewrites the file with
`UPDATE_ACTION_IDS=1`. Engine sync does that on every sync, from the engine it built, so the file follows the
presets; its `engine` field says which engine it was taken from.

Still to add (lane L3 collects them): real SimC addon exports and a WoWSims addon export from WoW
Forever characters.
