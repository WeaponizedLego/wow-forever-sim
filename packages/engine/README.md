# @fsim/engine

Lane L2. Runs the [wowsims/forever](https://github.com/wowsims/forever) engine (MIT) as WASM in
Web Workers and implements `EngineClient` from `@fsim/contracts`.

## Usage

```ts
// Browser (Nuxt/Vite bundles src/worker.browser.ts as a module worker)
import { createBrowserEngineClient, withDatabases } from '@fsim/engine';
const engine = createBrowserEngineClient({ lock, sources /* while lock.artifacts is null */ });
const result = await engine.raidSim(withDatabases(request, uiDatabase), { signal, onProgress });

// Node (tests, tools): worker_threads
import { createVendorEngineClient, createNodeEngineClient } from '@fsim/engine/node';
```

| Export                                                                                              | What                                                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `WasmEngineClient`                                                                                  | `EngineClient`: `raidSim`, `statWeights`, plus `computeStats` (not in the contract yet), `dispose`       |
| `createBrowserEngineClient({ lock, sources?, concurrency?, … })`                                    | Web Workers; assets from `lock.artifacts` (sha256-verified) or explicit `sources`                        |
| `createNodeEngineClient` / `createVendorEngineClient` (`/node`)                                     | worker_threads; the vendor one uses `vendor/` from `scripts/build-local.mjs`                             |
| `loadEngineAssets`, `assetSourcesFromLock`, `engineVersionFromLock`                                 | fetch → verify sha256 (of the bytes as fetched, i.e. the `.gz`) → gunzip if gzip → `WebAssembly.compile` |
| `buildPlayerDatabase(player, db, partyBuffs?)`, `withDatabases(req, db)`, `withStatWeightsDatabase` | per-player `SimDatabase` subset from a `UIDatabase` (see below)                                          |
| `WorkerPool`, `WorkerLike`, `EngineError`                                                           | lower level: the pool, the worker adapter interface, the error type                                      |

Errors: an engine `ErrorOutcome` (or a request it cannot parse) rejects with `EngineError`; an abort
rejects with the signal's reason (`DOMException` `AbortError` by default).

Concurrency defaults to `navigator.hardwareConcurrency` / `os.availableParallelism()`, capped at 8
(`maxConcurrency`); each worker holds its own module instance and Go heap.

### Local engine for dev and tests

```sh
node packages/engine/scripts/build-local.mjs --src /path/to/wowsims/forever   # or FSIM_FOREVER_SRC=…
```

Builds `lib.wasm` (Go via `GOTOOLCHAIN=auto`; protoc-gen-go goes to `vendor/.gobin` if missing) and
copies the matching `wasm_exec.js`, `db.bin`, `leftover_db.bin` into `vendor/` (gitignored), with a
`manifest.json` of sha256s. WASM tests skip with a message when `vendor/` is empty. The pipeline
(lane L1) owns the real artifacts.

## Worker protocol (`src/protocol.ts`)

The worker is proto-agnostic: it moves bytes in and out of the WASM; the host decodes.

| Direction     | Message                                                | Meaning                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| host → worker | `{ type: 'init', module, wasmExecUrl, engineLogs }`    | Compiled `WebAssembly.Module` (structured clone; compiled once on the host). `wasmExecUrl` is a `data:` URL of the verified `wasm_exec.js`, imported as a module. The worker sets `globalThis.wasmready` **before** `go.run`. |
| host → worker | `{ type: 'call', id, method, payload, requestId? }`    | `method` is an engine function name. Sync methods answer once; `raidSimAsync` / `statWeightsAsync` stream progress. `requestId` is the engine's request id.                                                                   |
| worker → host | `{ type: 'ready' }` / `{ type: 'initError', message }` | Calls that arrive before `ready` are queued in the worker.                                                                                                                                                                    |
| worker → host | `{ type: 'result', id, payload }`                      | Sync answer (binary proto). For async methods an empty payload means "accepted".                                                                                                                                              |
| worker → host | `{ type: 'progress', id, payload }`                    | One binary `ProgressMetrics`. The one with `final*Result` set ends the call.                                                                                                                                                  |
| worker → host | `{ type: 'error', id, message }`                       | The call threw, or the engine returned nothing (request did not parse).                                                                                                                                                       |
| worker → host | `{ type: 'exit', message }`                            | The Go runtime exited (unrecovered panic). The pool replaces the worker and fails its job.                                                                                                                                    |

Payload buffers are transferred, not copied. The pool runs one job per worker at a time (FIFO queue
per worker, least-loaded placement). Entries: `src/worker.browser.ts` (module Web Worker),
`src/worker.node.ts` (worker_threads; Node runs it with native type stripping, hence the `.ts`
import specifiers and `allowImportingTsExtensions`).

### raidSim

1. `raidSimRequestSplit` into `min(concurrency, iterations)` requests (engine code). Each split gets
   request id `<parent>-<i>`.
2. `raidSimAsync` per split, in parallel. Progress is aggregated: iterations summed, DPS/HPS weighted
   by iterations done; monotonic; the last event carries `finalRaidResult`.
3. `raidSimResultCombination` (skipped for a single split).

`statWeights` runs `statWeightsAsync` on one worker. Upstream parallelises stat weights with
`statWeightRequests` / `statWeightCompute` / `statWeightTopUpPlan` (paired per-iteration sums, top-up
passes; ~300 lines in `ui/sim/wasm/stat_weights.ts`). Not ported for v1.

## Phase 1 findings (engine quirks)

- **`abortById` cannot interrupt a running sim.** The engine's "yield" (`time.Sleep(time.Microsecond)`
  every 100 ms) expires before the Go scheduler goes idle, so it never returns to the JS event loop;
  the worker reads the abort only after the sim has finished (measured: a 20k-iteration sim ran to
  the end). So **abort terminates the worker** running the job and starts a fresh one from the
  already-compiled module (~0.4 s to be ready again). The caller's promise rejects at once (~150 ms
  in the test, mostly start-up). Queued jobs of an aborted run are dropped.
- **Split/combine preserves everything we need.** Each split starts at the seed its iterations had in
  the single run (`seed + offset`, and the engine reseeds per iteration), so per-iteration values are
  identical: `allValues` is the concatenation in iteration order (equal to the single run), `hist` is
  summed (equal), `logs` come from split 0, which alone keeps `debugFirstIteration` (equal). With
  `simOptions.debug` the combiner concatenates all splits' logs with `-SIMSTART-` separators. No fixes
  needed on our side.
- **Worker count changes only the last bits of the mean.** The combined mean is the iteration-weighted
  sum of split means, so 8 workers gave 850.1967885938789 vs exactly 850.196788593879 on one (Δ ≈ −1e-13;
  stdev equal to ~6 decimals). Same request + seed + worker count → bitwise identical. `randomSeed: 0`
  makes the splitter pick a time-based seed, so pass a seed for reproducible runs.
- **The engine's item database is global per worker and append-only** (`AddToDatabase` never
  overwrites an id). A worker keeps every row any earlier request carried, so a missing row can be
  masked by an earlier request, and a data update needs fresh workers (or a new client). An abort
  resets the aborted workers.
- `iterations: 0` sims one iteration and returns zeros; the client rejects `iterations < 1`.
- The engine logs with `log.Printf` (e.g. "running 5000 iterations took …"); `engineLogs: false`
  silences it.
- protobuf-ts `create()` deep-copies its argument; the final progress event attaches the result after
  `create()` so listeners get the same object the promise resolves with.

### SimDatabase subset

`buildPlayerDatabase` ports upstream's `Gear.toDatabase`, `Player.toDatabase`,
`mergeSimDatabases`, `addPartyBuffItems` and `extendPlayerProtoWithMissingEffects`: equipped and
item-swap items, every enchant row of their effect ids (rows differ only in slot rules; the engine
picks), random suffixes, rand-prop points for the items' base item levels, the Darkspear item while
that party buff is on, and the consumables the `ConsumesSpec` names plus their spell effects. For the
fixture player: **13.8 KB** binary vs the spike's 200 KB, and the rebuilt request sims to exactly
850.196788593879. The sim reads spell effects only in tests; consumables are what matter. Mage mana
gems (`sim/mage/mana_gems.go`) are looked up by fixed ids the spec never names; like upstream we do
not send them, and the engine falls back to a fixed 2 min cooldown.

### Timing (Node 24, M-series, 8 logical cores, 5,000 iterations of the fixture)

| Run                                 | Wall time   |
| ----------------------------------- | ----------- |
| 1 worker, cold (incl. compile/init) | 10.6–12.8 s |
| 1 worker, warm                      | 10.5–10.9 s |
| 8 workers, warm                     | 2.2–2.4 s   |
| sim after an abort (incl. respawn)  | 2.2–2.8 s   |
| statWeights, 400 it, 4 stats        | 3.6–3.9 s   |

### For Phase 2 (browser)

- The worker is a **module** worker and imports `wasm_exec.js` from a `data:` URL: a CSP needs
  `worker-src 'self'`, `script-src 'self' data:` (or serve `wasm_exec.js` same-origin and pass its URL
  without a sha256) and `'wasm-unsafe-eval'`.
- `DecompressionStream` and `crypto.subtle` are required (secure context).
- While `engine.lock.json` has `artifacts: null`, pass `sources` (e.g. a dev route serving
  `packages/engine/vendor/`).
- Build one client per engine version and `dispose()` it on switch; keep it alive otherwise (start-up
  costs one compile plus ~0.4 s per worker).

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
