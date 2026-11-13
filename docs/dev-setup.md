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
  IndexedDB history, offline, deploy) not started. Engine sync only runs once its workflow is on `main`.

## Offline and performance

### Budget

`apps/web/scripts/check-budget.mjs` reads the generated site and, per page route, adds up the gzip size of the
JS a first visit downloads before any engine file (entry chunk + its static imports, the default layout and the
route chunk with their preload lists), plus CSS. It fails when a product route is over 300 KB (`/dev/*` routes
are listed, not enforced).

```bash
cd apps/web && corepack pnpm@12.18.0 exec nuxt generate && node scripts/check-budget.mjs
# options: --budget-kb 300 --dir .output/public
```

`/` is about 224 KB today. The largest piece (~128 KB gz) is one shared chunk with the generated protos, zod,
the importers and gamedata, pulled in by `composables/session.ts`. Fonts (Google Fonts, ~60 KB woff2) are not
counted.

### Engine prefetch

`app/plugins/sw.client.ts` waits for the app to mount and the page to go idle, then fetches `current.json` and
the four engine files (`lib.wasm.gz`, `wasm_exec.js`, `db.bin`, `leftover_db.bin`) at low priority. The first
sim then reads them from cache instead of waiting ~7.5 MB.

### Service worker

`apps/web/public/sw.js`, hand-written. A nitro `compiled` hook in `nuxt.config.ts` writes the output copy with
the precache list (`/` plus every file in `/_nuxt/`) and a version (hash of that list). It is only registered in
production builds. In dev the plugin unregisters any leftover worker.

| Request                             | Strategy                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| navigations (HTML)                  | network-first. Offline: the cached `/` shell, whose router renders the route |
| `/_nuxt/*` (hashed)                 | precached on install, cache-first                                            |
| `/_nuxt/builds/*`, Google Fonts CSS | network-first, cached copy offline                                           |
| `/engine/<id>/*`                    | cache-first in `engine-<id>` (immutable per id)                              |
| `/engine/current.json`              | network-first. A new id deletes the other `engine-*` caches                  |
| `fonts.gstatic.com`                 | cache-first                                                                  |

Updates are silent. A new deploy changes `sw.js`. The browser installs it in the background, and it takes
over at once (`skipWaiting` + `clients.claim`) and deletes the old shell cache. HTML is network-first, so an
online reload always shows the newest deploy. Offline, you get the last build that was cached. If an old tab
lazy-loads a chunk that the deploy removed, Nuxt's chunk-error handling reloads the page.

### Test offline

```bash
cd apps/web && corepack pnpm@12.18.0 exec nuxt generate
cd .output/public && python3 -m http.server 4317 --bind 127.0.0.1
```

1. Open `http://127.0.0.1:4317/` in Chrome. Wait a few seconds. In DevTools → Application → Service workers,
   `sw.js` is activated. Cache storage holds `shell-…`, `engine-<id>` (4 entries) and `runtime`.
2. Run a sim (`/dev/engine` → Run sim).
3. Stop the server, or tick DevTools → Network → Offline. Then reload any route and run a sim again.

To reset, use DevTools → Application → Storage → Clear site data. Use a port you don't use for `nuxt dev`. In
dev the plugin unregisters the worker, but the old caches stay until you clear them.

### Cloudflare Pages headers

`apps/web/public/_headers` gives `/_nuxt/:file` and `/engine/:id/*` a one-year immutable cache. It sets
`current.json` and `sw.js` to `no-cache`. HTML keeps the Pages default (revalidate). `lib.wasm.gz` gets no
special rule. Pages serves it as `application/gzip` with no `Content-Encoding`, the same as upstream's
`www.wowsims.com/forever/lib.wasm.gz`. The loader gunzips it and checks its sha256.
