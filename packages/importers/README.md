# @fsim/importers

Turns pasted text into a `Character` plus diagnostics (`ImportResult` from `@fsim/contracts`).
Nothing here throws on bad input.

```ts
import { importAny, detectFormat, simcImporter, wowsimsImporter, wowheadImporter } from '@fsim/importers';
const result = importAny(pasted, ctx); // { format, character, diagnostics }
```

| Export                                               | What                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `detectFormat(input)`                                | `'simc' \| 'wowsims-json' \| 'wowhead-url' \| null`. Checks Wowhead link, then JSON, then SimC |
| `importAny(input, ctx)`                              | Detects the format and parses. Unknown format → `FMT-01` error, `character: null`              |
| `simcImporter`, `wowsimsImporter`, `wowheadImporter` | The three `Importer`s; `IMPORTERS` lists them in detection order                               |
| `readWowheadHash(hash)`                              | The raw Wowhead planner hash decoder                                                           |
| `WowheadImportContext`                               | `ImportContext` + optional `enchantIdForSpell(spellId)` (see below)                            |

## Diagnostics

| Code         | Severity       | When                                                                                                                                                                              |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FMT-01`     | error          | Not a recognised format; not valid JSON; not a planner link                                                                                                                       |
| `PARSE-02`   | warning        | A SimC line that is not `key=value`; gear line without an id; bad number; level out of range                                                                                      |
| `PARSE-02`   | info           | Read but not used: `legacy_talents`, `pet_*`, `bagN`, `shirt`/`tabard`/`ammo`, unknown options and item keys (`bonus_id`, `gem_id`…), unknown professions, a WoWSims APL rotation |
| `DATA-03`    | warning        | Item id not in the data build (slot left empty); enchant not in it (item kept without the enchant)                                                                                |
| `SPEC-04`    | error          | No class, or a class Forever does not have (`character: null`)                                                                                                                    |
| `SPEC-04`    | warning / info | Spec not given or unknown, so it was picked (info when the class has one spec or talents decided)                                                                                 |
| `SPEC-04`    | warning        | Race the engine lacks; class default race used                                                                                                                                    |
| `DEFAULT-05` | info           | Rotation, consumables (always), race, gear, talents missing → spec preset fills them                                                                                              |
| `DEFAULT-05` | warning        | Talents present but unusable (SimC client loadout string; WoWSims export from a non-Forever client)                                                                               |

SimC diagnostics carry the 1-based `line`; gear findings carry `field` = slot id (`mainHand`, …).
`character.rotation` is always `{ kind: 'preset', presetId: 'default' }` and `consumables` is `{}`;
filling them is the engine package's job. `professions` are lowercase English names (`engineering`).

## SimC (Forever) — what the real format is

Verified against the source, not guessed:

- **Addon**: `simulationcraft/simc-addon` master (v12.1.5-04, TOC `16001` for Forever).
  `core.lua` `GetSimcProfile`, `extras.lua` (slot names; `ranged` added on Forever),
  `forever/legacytalents.lua`, `forever/pet.lua`, `forever/stats.lua`.
- **SimC itself**: `simulationcraft/simc` branch `forever` (`engine/util/util.cpp`,
  `engine/player/player.cpp`, `engine/dbc/generated/trait_data.inc`, build 1.60.1.70425).

Findings:

1. **`spec=unknown` always.** The Forever client has no specialization API, so the addon writes
   `spec=unknown`, an empty `role=`, and no spec in the header. SimC's forever branch itself only
   knows class-level specs (`SPEC_WARRIOR` = `"warrior"`). The importer therefore takes a named spec
   if present (hand-edited profiles, other tools), else infers it from engine-format talents, else
   from `role=`, else uses the class's first DPS spec — with a `SPEC-04` saying so.
2. **Talents are not the engine's digit string.** `talents=` is
   `C_Traits.GenerateImportString(configID)`: Blizzard's base64 loadout bitstream (version 8 bits,
   spec 16, tree hash 128, then per node sorted by node id: selected/purchased/partial-rank/choice
   bits). Converting it needs, per class, the client's node id list mapped to tree positions. A
   table could be built by joining SimC's `trait_data.inc` (node id ↔ TraitDefinition id) with the
   engine's `ui/sim/talents/trees/<class>.json` (`definitionId` per position, the same join the
   WoWSims exporter uses), **but** SimC's data (build 70425) already disagrees with the engine's
   trees (new talents missing, max ranks differ for ~25 talents), and one missing node shifts every
   later bit. A wrong talent build is worse than none, so the importer emits `DEFAULT-05` (warning)
   and leaves `talents: ''`. Engine-format digit strings (`5232220115501351--5053`) are used as is.
3. **Races**: `race=skyborne_alliance` (race id 95) and `race=skyborne_horde` (96). Upstream wowsims
   puts High Order Skyborne on the Alliance and Windshaper Skyborne on the Horde, so they map to
   `highorderskyborne` / `windshaperskyborne`. Also accepted: `high_order_skyborne`,
   `windshaper_skyborne`, `scourge`/`forsaken`.
4. **Gear lines**: `slot=,id=N[,enchant_id=E][,gem_id=…][,bonus_id=…]`, each preceded by a
   `# Name (ilvl)` comment. `enchant_id` is the SpellItemEnchantment id, which is the engine's enchant
   effect id. The addon does **not** write a random suffix on Forever (it reads only id, enchant,
   gems, bonus ids from the link); `suffix=N` is accepted when present (SimC's own item option).
   Slots: `head neck shoulder back chest shirt tabard wrist hands waist legs feet finger1 finger2
trinket1 trinket2 main_hand off_hand ammo ranged`.
5. **Forever extras** (`legacy_talents=`, `bag1..4=`, `pet_family=` …, `# ammo_count=`, stats/skills/buffs
   comments, `# Checksum: <adler32>`) are skipped with an info note. The checksum is not verified.

## WoWSims addon JSON

Ported from upstream `ui/features/import-export/importers/addon.ts` (MIT). Format from
`wowsims/exporter` (`ExportStructures/*.lua`, `Flavors/Forever/*.lua`,
`tools/test/snapshots/forever.txt`). `gear.items` is positional in ItemSlot order with `null` for
empty slots (upstream filters the nulls, which shifts later slots; we keep positions).
Talents are only used when `flavor` is `"forever"`. The `spec` field (`fury`, `feral_bear`,
`holy_disc`, `marksman`, …) picks the engine spec. No network version check.

## Wowhead gear planner

Decoder ported from upstream `wowhead_gear_planner.ts` (MIT). Class and race come from the path,
spec from the talents' points per tree. Wowhead stores enchants as **spell ids** in **2 bytes**;
the engine wants effect ids, so the context's `enchantIdForSpell` maps them. Without it every
enchant is a `DATA-03`. Forever enchants whose spell id is above 65535 (e.g. 1217203, 1254772)
cannot be represented in a planner link at all and also come back as `DATA-03`.

## Tests

`src/fixtures.test.ts` holds golden tests over `fixtures/import/*` (expected output in
`fixtures/import/expected/`, update with `vitest -u` and review). `src/importers.test.ts` covers
the rules above and a 3,000-input fuzz run. The test `ImportContext` reads
`fixtures/import/data-ids.json`, generated from upstream `db.json` with
`node packages/importers/scripts/gen-test-data.mjs <db.json> <label>`.
