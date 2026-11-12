# tools/engine-build: engine-sync pipeline

Keeps `engine.lock.json` on the [wowsims/forever](https://github.com/wowsims/forever) (MIT) commit
that wowsims.com/forever serves (`wowsims/pages-deploy` → `forever/version.json`). Upstream's git
tags are stale, so the engine version is that commit; `engineId` is its 7-character short form.

`.github/workflows/engine-sync.yml` runs these scripts every hour and on `workflow_dispatch`. They
also run locally. All of them are Node ESM with no dependencies, except `promote.mjs` (it needs
`pnpm install` for zod).

| Step    | Script                                                             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check   | `check.mjs [--commit <sha\|ref>] [--force]`                        | Reads `version.json` (or `--commit`), compares it with the lock and prints `{update, commit, engineId, current}`. In Actions it also writes these to `$GITHUB_OUTPUT`. A lock with `artifacts: null` always counts as needing an update.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| build   | `build.mjs <commit> [--require-wasm-opt] [--no-protos] [--fresh]`  | Shallow-clones upstream at the commit and installs `protoc-gen-go` (the protobuf version in upstream's `go.mod`) into a local GOBIN. Generates the Go protos and builds with `GOOS=js GOARCH=wasm go build -ldflags "-w -s" ./sim/wasm/`. Runs `wasm-opt -O3` with the `WASM_FEATURES` from upstream's makefile, or warns if wasm-opt is missing, then gzips with `-9`. Copies `wasm_exec.js` from the same toolchain, and `db.bin` and `leftover_db.bin`. Writes a candidate lock with sha256 and sizes. `dataBuild` comes from the newest `[DB] … 1.x.y.z` commit that touched `db.bin`, via the GitHub API, and is null if none is found. Replaces `packages/proto/proto/*.proto` with upstream's and regenerates `packages/proto/src/generated`. |
| smoke   | `smoke.mjs <commit> [--no-write] [--tolerance 0.25] [--workers N]` | Simulates every spec through the new `lib.wasm.gz` in Node worker threads (see below). Fails on any error, unfinished iterations, 0 DPS, or DPS more than ±25% from `smoke-baseline.json`. Writes `smoke-report.md` (the PR body) and `smoke-results.json`. If everything passed, it also writes the new `smoke-baseline.json`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| promote | `promote.mjs <commit>` / `promote.mjs --validate [file]`           | Validates the candidate lock against `EngineLockSchema` (imported from `packages/contracts/src/engine.ts`) and writes it to `engine.lock.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Work files go to `$ENGINE_BUILD_WORK`, which defaults to `$TMPDIR/fsim-engine-build`. Keeping them
outside the repo means prettier, eslint and vitest never scan them:

```
forever-<id>/              upstream clone (reused by the next build of the same commit)
gobin/                     protoc-gen-go
out/<id>/lib.wasm.gz       release asset
out/<id>/wasm_exec.js      release asset
out/<id>/db.bin            release asset
out/<id>/leftover_db.bin   release asset
out/<id>/engine.lock.json  candidate lock (URLs → releases/download/engine-<id>/<file>)
out/<id>/build-info.json   sizes and step timings
out/<id>/smoke-requests/   exported requests (protojson, ~200 KB each) + meta
out/<id>/smoke-report.md   per-spec DPS delta table
```

Nothing under the work dir is committed. The workflow commits only `engine.lock.json`,
`tools/engine-build/smoke-baseline.json`, `packages/proto/proto/` and
`packages/proto/src/generated/`.

## Run locally

Needs git, Go (any recent version; `GOTOOLCHAIN=auto` fetches upstream's 1.27), `protoc`, Node 24,
and `corepack pnpm@12.18.0 install`. `wasm-opt` (binaryen) is optional. Without it the build warns
and ships an unoptimised WASM. Set `WASM_OPT=/path/to/wasm-opt` if it is not on PATH.

```sh
node tools/engine-build/check.mjs                      # what does wowsims.com serve?
C=<40-char commit from check>
node tools/engine-build/build.mjs $C                   # ~30 s warm
node tools/engine-build/smoke.mjs $C                   # ~1–2 min (8 workers)
node tools/engine-build/promote.mjs $C                 # writes engine.lock.json
corepack pnpm@12.18.0 exec vitest run --project proto  # generated types still parse the fixtures
corepack pnpm@12.18.0 --filter @fsim/proto exec tsc -p tsconfig.json
```

To try a commit without touching the repo, use `build.mjs $C --no-protos` and
`smoke.mjs $C --no-write`, and skip `promote`.

## What the smoke test sims

Only three specs ship complete SIML presets upstream (Hunter, Retribution Paladin and Protection
Paladin). Every spec does have an upstream Go test suite (`sim/**/Test*.results`), and each full
suite contains an `Average-Default` raid sim. That sim is upstream's own default setup for the
spec: default race, gear set, talents, APL, consumables, full buffs, single target, 2,000
iterations and seed 101. Upstream maintains these setups and must keep them compiling.

`smoke.mjs` copies `smoke/fsim_smoke_*.go.txt` into the clone's `sim/core` and adds one guarded
line at the top of `RunTestSuite`. It then runs `go test -tags with_db,fsim_smoke` over every suite
package. With `FSIM_SMOKE_OUT` set, the hook doesn't run the suite. Instead it writes the
`Average-Default` request with each player's `SimDatabase` attached, because the WASM carries no
item data (see `packages/engine/README.md`). It also writes the native DPS that upstream's
`.results` file expects for that exact request. The WASM result must be within ±25% of the
baseline. A mismatch with the native number is a warning, not a failure. At `b2047bf` and `4440441`
all 22 suites matched native exactly.

Smoke-tested (22 suites, 15 specs):

- Affliction, AfflictionWrack, DemonologyFireBrand, DemonologyShadowBrand, Destruction (Warlock)
- Arcane, FFB, Fire, Frost (Mage)
- Hunter, HunterPets
- Balance, FeralCat, FeralBear
- DpsWarrior, ProtectionWarrior
- Retribution, Protection (Paladin)
- Elemental, Enhancement
- Rogue, ShadowPriest

Not smoke-tested:

- Holy Paladin and Healer Priest: their upstream suites are stats-only, because upstream treats
  them as gear planners with no healing rotation.
- Restoration Druid and Restoration Shaman: upstream calls `t.Skip` on these suites.
- FeralCatCoverage and FeralBearCoverage: these are cast-coverage suites, not DPS suites.

## Failure modes

| Symptom                                                        | Cause                                                                                                                                                           | What to do                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upstream RunTestSuite signature changed`                      | Upstream refactored `sim/core/test_suite.go`.                                                                                                                   | Update the anchor regex in `smoke.mjs` and, if the generator types changed, `smoke/fsim_smoke_hook.go.txt`.                                                |
| `go test` compile error in smoke                               | Upstream test code doesn't build with `with_db`, or the hook no longer matches core's internals (`CombinedTestGenerator.subgenerators`, `readExpectedResults`). | Read the issue log, then fix the hook. If upstream itself is broken, wait for the next commit.                                                             |
| `FAIL: error` in the table                                     | The WASM returned an error, usually a missing DB row (a new item field or a consumable that isn't sent).                                                        | Check `fsimSubset` against upstream's `toDatabase()`.                                                                                                      |
| `FAIL: outside ±25%`                                           | Large tuning change or a regression upstream.                                                                                                                   | If the change is intended, re-run with `--tolerance` (or `SMOKE_TOLERANCE`) raised, or delete that suite's entry from the baseline, and say why in the PR. |
| `wasm-opt not found`                                           | binaryen is missing. CI fails because of `--require-wasm-opt`.                                                                                                  | Install binaryen (`apt-get install binaryen`).                                                                                                             |
| `protoc not found` / wrong protoc-gen-go                       | Toolchain problem.                                                                                                                                              | The workflow pins protoc 34.1 and protoc-gen-go to upstream's `go.mod`.                                                                                    |
| `dataBuild` is null                                            | No `[DB] … <build>` commit touched `db.bin`, or the GitHub API limit was hit (60 requests per hour without a token).                                            | Harmless. Set `GH_TOKEN` locally.                                                                                                                          |
| Workflow: `release … is referenced by main's engine.lock.json` | A forced rebuild of the engine already on main.                                                                                                                 | Release assets the lock points at are never overwritten. Leave it as is, or bump upstream.                                                                 |

When a step fails, the workflow publishes nothing and opens an `engine-sync failed: <id>` issue
with the report and the log tails. If that issue already exists, it adds a comment instead.
Scheduled runs skip a commit that has an open failure issue or an open sync PR. Run
`workflow_dispatch` with `force: true` to retry.

## Rolling back

Revert the engine-sync PR's merge commit on main. The lock then points back at the previous
`engine-<id>` release. Releases are never deleted, so every engine version that was ever locked
stays downloadable, and old share links keep working. To pin a specific older engine, run the
workflow with `commit: <sha>` (and `force: true`). The next hourly run moves forward again once
`version.json` changes. To stop it doing that, disable the workflow.

## Repo setup the workflow needs

- **Auto-merge.** Turn on Settings → General → "Allow auto-merge", and add branch protection on
  `main` that requires `ci`. Without protection, `gh pr merge --auto` either errors (the workflow
  only warns) or merges immediately.
- **`ENGINE_SYNC_TOKEN` secret.** Use a fine-grained PAT or GitHub App token with contents and
  pull-requests read/write. PRs pushed with the default `GITHUB_TOKEN` don't trigger `ci.yml`, so
  the required check would never report and auto-merge would hang. Without the secret the workflow
  falls back to `GITHUB_TOKEN`.
- **Permissions.** The release and the issue use the job's `GITHUB_TOKEN` with
  `contents: write` and `issues: write`. The workflow default is `permissions: {}`.
