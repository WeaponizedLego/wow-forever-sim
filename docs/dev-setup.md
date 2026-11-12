# Dev setup (new machine)

## Prerequisites

- Node 24 (`.nvmrc`). pnpm comes from corepack: use `corepack pnpm@12.18.0 …` (the version is pinned in
  `package.json` `packageManager`).
- Go (any recent version; `GOTOOLCHAIN=auto` fetches Go 1.27 for the engine build).
- `protoc` (only needed to rebuild the engine or regenerate protos).

## Install

```bash
git clone git@github.com:WeaponizedLego/wow-forever-sim.git && cd wow-forever-sim
git checkout phase-0
corepack pnpm@12.18.0 install
```

## Local engine (needed to sim in dev and for the real-WASM tests)

The engine WASM is not in git. Build it from the upstream commit pinned in `engine.lock.json`:

```bash
git clone https://github.com/wowsims/forever.git ../forever-upstream
git -C ../forever-upstream checkout "$(node -p "require('./engine.lock.json').upstream.commit")"
node packages/engine/scripts/build-local.mjs --src ../forever-upstream
node apps/web/scripts/stage-engine.mjs
```

This fills `packages/engine/vendor/` and stages the browser copy in `apps/web/public/engine/` (both gitignored).
Without it the app shows "engine unavailable" and the real-engine tests skip.

## Run

Pnpm 12 under corepack fails when one pnpm script calls another, so run tools directly:

```bash
cd apps/web && corepack pnpm@12.18.0 exec nuxt dev --port 3000
```

- `/` start · `/workbench` · `/runs/0001` · `/top-gear`
- `/dev/kit` UI kit · `/dev/engine` browser engine check (real shaman export)

## Checks

```bash
corepack pnpm@12.18.0 -r --parallel typecheck
corepack pnpm@12.18.0 exec eslint .
corepack pnpm@12.18.0 exec prettier --check .
corepack pnpm@12.18.0 exec vitest run
```

## Where things are

- Plan and status: `docs/plan.md`; features: `docs/features.md`; engine findings: `packages/engine/README.md`.
- UI design (v2 is the approved direction): https://claude.ai/artifact/UpvfYeTSiM5oUmsncPjxYn
- Open items: SimC talent strings are not converted; weapon damage not weighed by default; Phase 3 (share links,
  IndexedDB history, offline, deploy) not started; GitHub settings for engine sync (auto-merge, branch protection,
  `ENGINE_SYNC_TOKEN`) not set up.
