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
| `readWowheadHash(hash)`                              | The raw Wowhead planner hash decoder (all three formats)                                       |
| `parseWowheadLink(text)`                             | `{ game, className, raceName, hash }` of the first planner link in the text, or null           |
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
| `DEFAULT-05` | warning        | Talents present but unusable (a SimC client loadout string that cannot be read safely, with the reason; WoWSims export from a non-Forever client)                                 |
| `PARSE-02`   | warning        | Talents converted from a client loadout string for a class whose tree layout no real export has confirmed yet (see below)                                                         |

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
   `C_Traits.GenerateImportString(configID)`, converted by `src/loadout.ts`. See
   [Client loadout strings](#client-loadout-strings-talents) below. Engine-format digit strings
   (`5232220115501351--5053`) are used as is.
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

## Client loadout strings (talents)

What we found (spike, November 2026), and what `src/loadout.ts` does with it.

**Format.** Blizzard's `ExportUtil` / `ClassTalentImportExportMixin`: base64 (`A–Z a–z 0–9 + /`), 6 bits
per character, least significant bit first, and values read least significant bit first. Header:
version (8 bits), spec id (16), tree hash (16 × 8). Then one entry per node of the class's trait tree,
in node id order: `selected` (1); if selected, `purchased` (1, version 2 only); if purchased,
`partially ranked` (1) plus `ranks` (6) when set, then `choice node` (1) plus `choice index` (2). A
fully ranked node is at the game's maximum rank. The Forever client writes version 2; the shaman's
spec id is 1489 (a class-level "spec").

**Node order.** Forever has one trait tree per class holding all three tabs. Its nodes include
retired talents the game "parks" off the canvas (upstream drops those from the engine's trees, see
upstream `tools/database/tables.go` `parkedTraitNodes`), so the engine's trees alone cannot give the
bit order. SimC's `trait_data.inc` (forever branch, build 70425; committed as `src/loadout-nodes.json`
by `packages/gamedata/scripts/extract-simc-trait-nodes.ts`) lists every node with its TraitDefinition
id, parked ones included. Joining on `definitionId` with the engine's trees
(`packages/gamedata/data/talents`) places each node. Talents the engine has and SimC's older build
lacks (warrior 1, paladin 3, rogue 2; all with definition ids above every SimC id) are slotted in by
definition id, because node id order equals definition id order for all 469 SimC rows (tested).

**What is proven.** The real level 42 shaman export (`fixtures/import/real/simc-shaman-lvl42.simc`)
decodes to exactly 33 points (42 − 9), Enhancement 25 / Restoration 8, a valid tree, with nothing but
padding left over; re-encoding that build gives the exact same string. The shaman's SimC nodes and the
engine's talents are the same 50 definitions. So the shaman tree (hash `f3647be8…`, spec 1489) is
**verified** (`VERIFIED_TREES`).

**What is not.** No other class has a real export yet. SimC's build disagrees with the engine's on max
ranks for ~25 talents (harmless: a fully ranked node takes the engine's maximum) and on a few nodes
(paladin and rogue talents were replaced since 70425; the old nodes are assumed parked, not deleted).
One node too many or too few shifts every later bit. The tree hash would prove the list, but its
algorithm is not public, so we can only recognise hashes we have checked.

**What the importer does.**

- Refuses (`DEFAULT-05` warning with the reason; preset talents used) when: a character is not
  base64; the version is not 1 or 2; the string ends before the node list does; a bit is set past the
  last known node; a selected node is one the engine's trees lack (parked/retired) or a choice node; a
  rank is above the engine's maximum; the result is over 51 points or breaks the tree rules (5 points
  per row, prerequisites at their maximum). A misaligned read almost always trips one of these.
- Converts silently when the class's tree hash and spec are in `VERIFIED_TREES`.
- Otherwise converts and emits a `PARSE-02` warning on `talents`: the layout is unconfirmed and the
  build should be checked in the Talents tab (which shows the converted tree).

**To verify another class:** paste a real export, check the Talents tab against the character in game,
then add its hash and spec (`loadoutToTalents(...).header`) to `VERIFIED_TREES` with a golden test.
**To refresh the SimC table:** download `engine/dbc/generated/trait_data.inc` at a newer
`simulationcraft/simc` forever commit and rerun the script. A better source would be the game's own
`TraitNode` table for the current build (upstream's `tools/db2tool --cdn` can read it off Blizzard's
CDN); not done here.

## WoWSims addon JSON

Ported from upstream `ui/features/import-export/importers/addon.ts` (MIT). Format from
`wowsims/exporter` (`ExportStructures/*.lua`, `Flavors/Forever/*.lua`,
`tools/test/snapshots/forever.txt`). `gear.items` is positional in ItemSlot order with `null` for
empty slots (upstream filters the nulls, which shifts later slots; we keep positions).
Talents are only used when `flavor` is `"forever"`. The `spec` field (`fury`, `feral_bear`,
`holy_disc`, `marksman`, …) picks the engine spec. No network version check.

## Wowhead gear planner

Checked against wowhead.com in November 2026 (its planner code and links it wrote). Forever players
share links from Wowhead's **WoW Forever planner**:
`https://www.wowhead.com/forever/gear-planner/<class>/<race>/<code>`, or localized with the locale
after the game (`/forever/de/gear-planner/…`). `parseWowheadLink` also takes the Classic Era planner
(`/classic/…`, `classic.wowhead.com/…`; a `PARSE-02` info says so), other games' planners (`/tbc/`,
`/mop-classic/`…; `PARSE-02` warning), retail (`/gear-planner/…` with no game; gear skipped), a
class-only link (`…/gear-planner/hunter`) and locale-first paths. A lone link to any other Wowhead page
is a `wowhead-url` with an `FMT-01` error that says to copy the planner's address.

The code after class/race comes in three formats, told apart by its first character:

| First char | Format              | Written by                     | Decoder                                                 |
| ---------- | ------------------- | ------------------------------ | ------------------------------------------------------- |
| `F`        | packed, version 5   | the Forever planner (now)      | `wowhead-packed.ts`: base64url digits as prefix varints |
| `B`        | bytes, version 4    | the Classic Era planner (now)  | `readV4Items`: 3-byte item ids and values               |
| `A`        | bytes, versions 0–3 | older links, upstream exporter | ported from upstream `wowhead_gear_planner.ts` (MIT)    |

The packed format carries Wowhead's data environment (16 = Forever), level, talents as digits (the
same order as the engine's trees; checked for hunter), a talent tree version tag (`vkndmh`), the Legacy
calculator build (skipped) and per item: slot, id, random suffix, gems (skipped) and enchant **spell
ids**. The engine wants effect ids, so the context's `enchantIdForSpell` maps them; without it every
enchant is a `DATA-03`. Spell ids above 65535 (Forever's 1217203, 1254772…) fit in the packed format;
in the byte formats they are cut to 2 bytes and come back as `DATA-03`. Class and race come from the
path, spec from the talents' points per tree. `writePackedHash` builds test links.

## Tests

`src/fixtures.test.ts` holds golden tests over `fixtures/import/*` (expected output in
`fixtures/import/expected/`, update with `vitest -u` and review). `src/importers.test.ts` covers
the rules above and a 3,000-input fuzz run. The test `ImportContext` reads
`fixtures/import/data-ids.json`, generated from upstream `db.json` with
`node packages/importers/scripts/gen-test-data.mjs <db.json> <label>`.
