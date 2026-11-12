# @fsim/engine

Lane L2. Runs the [wowsims/forever](https://github.com/wowsims/forever) engine (MIT) as WASM in
Web Workers and implements `EngineClient` from `@fsim/contracts`.

## Phase 0 spike: what we know (2026-11-12, upstream `b2047bf`)

Reproduce with `tools/engine-build/spike/` (see its README).

### Versioning

- Upstream's `v0.0.x` git tags are stale. They came over from the TBC fork, and `v0.0.99` is a
  July 2026 commit from before Forever.
- The version wowsims.com/forever serves is the commit in
  `wowsims/pages-deploy` → `forever/version.json`. We pin that commit in `engine.lock.json`.

### Building

- `protoc --go_out` (with `protoc-gen-go`), then `GOOS=js GOARCH=wasm go build -ldflags "-w -s" ./sim/wasm/`.
- Go 1.27 (`GOTOOLCHAIN=auto` fetches it). It builds in about 13 s on an M-series Mac.
- Output is 32 MB unoptimised. Upstream runs `wasm-opt -O3` and gzips it.
- `wasm_exec.js` must come from the **same Go version** (`$(go env GOROOT)/lib/wasm/wasm_exec.js`).

### Loading

- After `go.run(instance)` the engine registers its functions on `globalThis`, then calls
  `globalThis.wasmready()`. **Define `wasmready` before `go.run`**; without it the engine panics.
- Exposed functions: `raidSim`, `raidSimJson`, `raidSimAsync`, `raidSimRequestSplit`,
  `raidSimResultCombination`, `computeStats`, `computeStatsJson`, `statWeights`,
  `statWeightsAsync`, `statWeightRequests`, `statWeightCompute`, `statWeightTopUpPlan`,
  `bulkCombinationCount`, `bulkCandidates`, `reforgeOptimize(Async)`, `abortById`, `simlNames`,
  `simlParse`, `simlPrint`.
- Binary functions take and return `Uint8Array` protos. The `*Json` variants take and return protojson strings.

### Item data (important)

- The WASM is built **without** the `with_db` tag, so it holds no item database.
- Every `Player` must carry `database: SimDatabase` (field 50) containing:
  - the equipped items (`SimItem`), their enchants (`SimEnchant`) and random suffixes;
  - `itemEffectRandPropPoints`;
  - **consumables and spell effects** the player uses. Without them the sim panics with
    `consumable 0 () states no on-use row`.
- The spike sent every consumable and spell effect (≈ 200 KB request). The real client should send
  only what the player's `consumables` and items reference. Upstream's logic to port is
  `ui/sim/proto/gear.ts` `toDatabase()`, `ui/sim/player/player.ts` `toDatabase()` and
  `Database.mergeSimDatabases`.

### Results

- Survival Hunter preset, 5,000 iterations, seed `0x5F1A`:
  - native Go: **850.19678859** DPS, σ 28.68;
  - WASM in Node: **850.19678859**, identical.
- The engine is deterministic per seed across builds.
- Speed: 10.4 s single-threaded in Node for 5,000 iterations, so a split across 8 workers
  should take about 1.5 s.
- `simOptions.saveAllValues: true` returns every iteration's DPS in `dps.allValues`.
  That feeds the histogram and convergence charts.
- `simOptions.debugFirstIteration: true` returns iteration 1's combat log in `logs` (≈ 380 KB).
  That feeds the timeline.
- `hist` arrives pre-binned (39 bins). `actions` and `auras` carry per-ability outcome counts
  (hits, crits, glances, misses, dodges…) and uptimes.
- Stat weights return `weights`, `weightsStdev` and `epValues`. The stdev gives the CI whiskers.
  Running them natively needs `sim.RegisterAll()`; in WASM the engine registers itself.

### Fixtures

`fixtures/engine/`: Survival Hunter raid-sim request and result (WASM), stat-weights request and
result (native). Code against these; do not need a live engine in unit tests.
