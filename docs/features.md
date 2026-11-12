# WoW Forever Sim — feature map

Browser-first sim for WoW Forever. We own the scaffolding; the engine is
[wowsims/forever](https://github.com/wowsims/forever) (MIT, Go → WASM), pinned and
refreshed by our own pipeline. Nuxt 4, pnpm, static/SSG deploy, all simming in Web Workers.

## What upstream gives us (verified 2026-11-12)

| Piece           | Where                                                                                | Notes                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine          | `sim/wasm/main.go` → `lib.wasm.gz`                                                   | Exposes `raidSimAsync`, `computeStats`, `statWeightsAsync`, `bulkCandidates`, `raidSimRequestSplit`/`ResultCombination`, `abortById`, `simlParse` |
| Contract        | `proto/*.proto`                                                                      | `RaidSimRequest` / `RaidSimResult`, `Player`, `EquipmentSpec { id, random_suffix, enchant }`                                                      |
| Game data       | `assets/database/db.bin` (+ `leftover_db.bin`)                                       | Items, enchants, consumables, drop sources (atlasloot input)                                                                                      |
| Talents / icons | `assets/talent_calc`, `assets/img`                                                   |                                                                                                                                                   |
| Data freshness  | upstream `check_hotfixes.yml` (hourly), `scheduled_release.yml` (daily tag `v0.0.N`) | No GitHub Releases, tags only. Built site in `wowsims/pages-deploy/forever` with `version.json`                                                   |
| Importers       | `ui/features/import-export/importers/`                                               | WoWSims addon, Wowhead gear planner, JSON, SIML. **No SimC importer.**                                                                            |

## Features

Legend: **M** = MVP, **N** = next, **L** = later.

### 1. Getting a character in (three doors, one model)

All three paths produce the same internal `Character` (class, spec, race, level, gear,
talents, professions, consumables) which serialises to the engine's `Player` proto.

|     | Feature                                                                                                                       | Notes                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | **Paste SimC string**                                                                                                         | Parse the SimulationCraft addon's Forever export (`head=,id=…,enchant_id=…`, `talents=`, `spec=`). We write this parser; upstream lacks it. Unknown lines reported, not fatal.                                             |
| M   | **Paste WoWSims addon export**                                                                                                | Reuse upstream format (JSON). Cheap win, community already has the addon.                                                                                                                                                  |
| M   | **Build from scratch**                                                                                                        | Pick class → spec → race, then paperdoll + talent tree. Start from upstream preset gear/talents for that spec.                                                                                                             |
| N   | **Character lookup** (realm + name)                                                                                           | Depends on whether Blizzard's profile API serves Forever characters (namespace unknown, needs a spike). Requires a tiny server route for the OAuth client-credentials token. If unavailable: hide the door, don't fake it. |
| N   | Wowhead gear planner link import                                                                                              | Upstream has the parser to reference.                                                                                                                                                                                      |
| M   | Detect class/spec automatically; show what we could not map (unknown item IDs, missing enchants) inline, never silently drop. |

### 2. Workbench (editing the character)

|     | Feature                                                                                             |
| --- | --------------------------------------------------------------------------------------------------- |
| M   | Paperdoll gear editor: slot → searchable item picker (filter by source, ilvl, stat), enchant picker |
| M   | Talent tree editor (Forever trees from upstream data), shareable talent string                      |
| M   | Live stat sheet via `computeStats` (instant, no sim run)                                            |
| M   | Consumables, raid buffs, debuffs with sensible presets ("Full raid", "Solo", "None")                |
| M   | Encounter settings: duration, target count (1–5), execute %, movement preset                        |
| N   | Rotation: pick upstream default APL; advanced users can view/edit SIML                              |
| N   | Pet / professions toggles where specs need them                                                     |

### 3. Simming

|     | Feature                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| M   | **Quick sim**: DPS with mean ± error, ability breakdown, resource graph, auras uptime                                         |
| M   | Runs in Web Workers, split across `navigator.hardwareConcurrency` via `raidSimRequestSplit` + `raidSimResultCombination`      |
| M   | Progress + cancel (`abortById`), iteration count presets (fast / standard / precise)                                          |
| M   | **Stat weights** (`statWeightsAsync`), shown as normalised weights plus "Pawn string" copy                                    |
| N   | **Top gear**: pick candidate items from bags/vault list, rank combinations (`bulkCandidates`)                                 |
| N   | **Droptimizer**: pick raid/dungeon → boss, sim every drop for your slots, rank by DPS gain. Uses drop-source data in `db.bin` |
| N   | Compare: up to 4 saved variants side by side (talents A vs B, trinket X vs Y)                                                 |
| L   | Target-count sweep chart (1–5 targets)                                                                                        |

### 4. Results & sharing

|     | Feature                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | Results page: headline DPS, delta vs previous run, breakdown table, timeline                                                                   |
| M   | Shareable link: character + settings compressed into the URL fragment (no backend needed); result recomputed on open, or optionally a snapshot |
| M   | Every result stamped with engine version + data build, so old links say "simmed on v0.0.99"                                                    |
| N   | Local history: last N sims per character in IndexedDB                                                                                          |
| L   | Short links + stored reports (needs a backend; defer)                                                                                          |

### 5. Data pipeline (automatic freshness)

|     | Feature                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | Engine pinned to an upstream tag in one file (`engine.lock.json`: tag, commit, sha256 of artifacts)                                                                                                                                                                                   |
| M   | **Scheduled GitHub Action** (hourly): compare upstream latest tag to lock → if newer, build `lib.wasm.gz`, generate TS protos, copy `db.bin` + talent/icon assets, run smoke sims (one per spec, assert no error and DPS within sane band of previous) → open PR, auto-merge on green |
| M   | Build from source at the tag (Go 1.27, reproducible), not from the pages-deploy bundle; hash recorded                                                                                                                                                                                 |
| M   | Site shows "Data: build X · updated 3 h ago" with link to upstream commit                                                                                                                                                                                                             |
| M   | Clear exemption: the 7-day `minimumReleaseAge` applies to **npm deps**, not to engine/game data, which we want same-day (hotfixes)                                                                                                                                                    |
| N   | Regression report on each bump: per-spec DPS delta table in the PR body (doubles as our "tuning history" content)                                                                                                                                                                     |
| L   | Public "tuning history" page built from those deltas                                                                                                                                                                                                                                  |

### 6. Platform & trust

|     | Feature                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| M   | pnpm with `minimumReleaseAge: 10080` (7 days) in `pnpm-workspace.yaml`, lockfile committed, `onlyBuiltDependencies` allowlist |
| M   | Static deploy (Nuxt SSG). WASM served with long cache + content hash                                                          |
| M   | Visible credit + link to WoWSims (MIT notice requests it)                                                                     |
| M   | Works offline after first load (service worker caches engine + data)                                                          |
| N   | Keyboard-first: command palette (⌘K) for item / spec / action search                                                          |
| L   | Accounts, guild roster sims (the differentiator from earlier analysis, needs a backend)                                       |

## Out of scope for v1

Accounts, server-side sims, guild roster, SimC engine, ads/monetisation.

## Open questions

1. Does Blizzard's profile API serve Forever characters? (Decides whether lookup is M or cut.)
2. Hosting target: Cloudflare Pages / Vercel / S3+CloudFront? (Lookup needs one server route.)
3. Domain / product name.
