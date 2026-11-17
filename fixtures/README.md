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

Still to add (lane L3 collects them): real SimC addon exports and a WoWSims addon export from WoW
Forever characters.
