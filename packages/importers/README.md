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

| Code         | Severity       | When                                                                                                                                                                                                           |
| ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FMT-01`     | error          | Not a recognised format; not valid JSON; not a planner link                                                                                                                                                    |
| `PARSE-02`   | warning        | A SimC line that is not `key=value`; gear line without an id; bad number; level out of range                                                                                                                   |
| `PARSE-02`   | info           | Read but not used: `legacy_talents`, `pet_*` (but see `pet_family` below), `bagN`, `shirt`/`tabard`/`ammo`, unknown options and item keys (`bonus_id`, `gem_id`…), unknown professions, a WoWSims APL rotation |
| `DATA-03`    | warning        | Item id not in the data build (slot left empty); enchant not in it (item kept without the enchant)                                                                                                             |
| `SPEC-04`    | error          | No class, or a class Forever does not have (`character: null`)                                                                                                                                                 |
| `SPEC-04`    | warning / info | Spec not given or unknown, so it was picked (info when the class has one spec or talents decided)                                                                                                              |
| `SPEC-04`    | warning        | Race the engine lacks; class default race used                                                                                                                                                                 |
| `DEFAULT-05` | info           | Rotation, consumables (always), race, gear, talents missing → spec preset fills them; a hunter pet family the engine has no pet of → the preset's pet is simmed                                                |
| `DEFAULT-05` | warning        | Talents present but unusable (a SimC client loadout string that cannot be read safely, with the reason; WoWSims export from a non-Forever client)                                                              |
| `TALENT-08`  | warning        | Talents converted from a client loadout string for a class whose tree layout no real export has confirmed yet (see below)                                                                                      |

SimC diagnostics carry the 1-based `line`; gear findings carry `field` = slot id (`mainHand`, …).
`character.rotation` is always `{ kind: 'preset', presetId: '' }` (no preset chosen) and `consumables` is `{}`;
`fillFromPreset` in `@fsim/gamedata` fills them from the preset build closest to the talents. `professions` are lowercase English names (`engineering`).
`character.specOptions` is `{}` except for a SimC hunter whose pet family the engine sims: `{ classOptions: { petType } }`,
which `fillFromPreset` completes with the preset's other options (ammo, quiver, the pet's attack speed).

## SimC (Forever) — what the real format is

Verified against the source, not guessed:

- **Addon**: `simulationcraft/simc-addon` master (v12.1.5-04, TOC `16001` for Forever).
  `core.lua` `GetSimcProfile`, `extras.lua` (slot names; `ranged` added on Forever),
  `forever/legacytalents.lua`, `forever/pet.lua`, `forever/stats.lua`.
- **SimC itself**: `simulationcraft/simc` branch `forever` (`engine/util/util.cpp`,
  `engine/player/player.cpp`) and its Forever fork `simulationcraft/simc-forever`
  (`engine/dbc/generated/trait_data.inc`, build 1.60.1.70938; `profiles/LowLevel/*.simc`).

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
5. **Forever extras** (`legacy_talents=`, `bag1..4=`, `pet_creature_id=` …, `# ammo_count=`, stats/skills/buffs
   comments, `# Checksum: <adler32>`) are skipped with an info note. The checksum is not verified.
6. **A hunter's pet** is read. The reconstructed fixture (written from addon 12.1.5-04's `forever/pet.lua`)
   has a `pet_family=cat` line; the one real hunter export we have, from 12.1.5-02
   (`fixtures/import/real/simc-hunter-lvl11.simc`), has no such line and names the pet only inside its
   commented character info block: `# pet_info=npc_id:…/name:bear/family:boar/type:beast/…`. Both are read
   (`pet_family` wins), and the family is matched against the engine's own pet types
   (`ImportContext.hunterPetTypes`, from `HunterOptions.PetType` in `hunter.proto`): `wind_serpent` is
   `WindSerpent`, `crocolisk` the engine's `Crocilisk`, `owl` its `BirdOfPrey`. The match sets
   `specOptions.classOptions.petType`. A family the engine has no pet of sets nothing and gets a `DEFAULT-05`
   note; the app then names the pet that is simmed instead (`apps/web/app/utils/pet-note.ts`). Other classes'
   pet lines (a warlock's demon) are still not used.

## Client loadout strings (talents)

What we found (November 2026), and what `src/loadout.ts` does with it.

**Format.** Blizzard's `ExportUtil` / `ClassTalentImportExportMixin`: base64 (`A–Z a–z 0–9 + /`), 6 bits
per character, least significant bit first, and values read least significant bit first. Header:
version (8 bits), spec id (16), tree hash (16 × 8). Then one entry per node of the class's trait tree,
in node id order: `selected` (1); if selected, `purchased` (1, version 2 only); if purchased,
`partially ranked` (1) plus `ranks` (6) when set, then `choice node` (1) plus `choice index` (2). A
fully ranked node is at the game's maximum rank. The last character is padded with zero bits. The
Forever client writes version 2 and a class-level "spec": warrior 1491, hunter 1485, shaman 1489,
warlock 1490 (seen in real exports; the other five are unknown). SimC's own reader
(`parse_traits_hash` in `engine/player/player.cpp`) reads it the same way.

**Node order.** Forever has one trait tree per class holding all three tabs, plus retired talents the
game "parks" off the canvas (upstream drops those from the engine's trees, see upstream
`tools/database/tables.go` `parkedTraitNodes`), so the engine's trees alone cannot give the bit order.
SimC's `trait_data.inc` lists every node with its TraitDefinition id, parked ones included. It is
committed as `src/loadout-nodes.json` by `packages/gamedata/scripts/extract-simc-trait-nodes.ts`, from
`simulationcraft/simc-forever` at build 1.60.1.70938. Joining on `definitionId` with the engine's trees
(`packages/gamedata/data/talents`) places each node. At this build every engine talent has a node, the
max ranks agree, and the only parked nodes are hunter Lightning Reflexes and Improved Serpent Sting and
priest Holy Specialization. Node id order equals definition id order in every class (tested), so a
talent the engine gains before the table is regenerated is slotted in by definition id.

Independent check: the data behind Wowhead's WoW Forever talent calculator gives each talent's node id
(`fixtures/import/real/wowhead-forever-trait-nodes.json`). For all nine classes it matches the table
node for node (tested). The calculator has no client-string export (only its own URL format, a
plain-text copy and saved builds), so it cannot give tree hashes or golden strings.

**Bug fixed by the 70938 table.** The table was from SimC build 70425, which kept nodes the client has
since deleted outright, not parked: mage Piercing Ice (gone in 70450) and Arcane Focus (70707), paladin
One-Handed Weapon Specialization and Instrument of Law (70707), rogue Improved Distract (70790). Each
extra node shifted every later bit, so current mage, paladin and rogue strings were misread (most then
failed the tree rules and were refused). In SimC's data history, warrior gained Reckless Swings in
70790; the hunter, warlock, shaman, druid and priest node sets are unchanged since 70450.

**What is verified.** Real SimC addon exports, all in `fixtures/import/real/` and listed with their
sources and evidence in `fixtures/import/real/loadouts.json`. Each decodes to a legal build, ends within
the padding of the last node, and re-encodes to the identical string (golden tests in
`src/loadout.test.ts`). Their tree hash and spec are pinned in `VERIFIED_TREES`, so those conversions
carry no `TALENT-08`.

| Class                               | Verdict        | Export (client)                | Decodes to              | Further evidence                                                                                                       |
| ----------------------------------- | -------------- | ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Shaman                              | verified       | level 42 (70888), a player     | `-0530303100212122-053` | 33 points; a level 20 export (70374) has the same hash and a subset of the same nodes                                  |
| Hunter                              | verified       | level 11 (70450), simc-forever | `051`                   | its stats show Focused Fire's +1% damage (rank 1 of 2); no one-node shift of the table gives another legal build       |
| Warrior                             | verified (old) | level 11 (70338), simc-forever | `20301`                 | two partial ranks; the tree then had 52 nodes, so today's 53-node tree likely has a new hash (`TALENT-08` till pinned) |
| Warlock                             | verified       | level 10 (70291), simc-forever | `005`                   | Improved Corruption 5/5 only; a shifted table would read its row-0 neighbour, so this rests on the node ids above      |
| Paladin, rogue, priest, mage, druid | evidence only  | none found                     |                         | node ids match Wowhead's; no real string, so no hash: conversions carry `TALENT-08`                                    |

The simc-forever exports are beta characters in
`https://github.com/simulationcraft/simc-forever/tree/3ff3afc994662cb924aa09e5ca2c4a13fd48c4da/profiles/LowLevel`
(names and realms replaced here). Searched without finding more: GitHub code and issues (`"TOC 16001"`,
`legacy_talents=`, `talents=` in simc-forever and wowsims/forever), simc-forever issues and PRs, and the
web (`"SimC Addon" "WoW 1.60.1"`).

**The tree hash.** Its algorithm is not public. The shaman exports show it does not cover rows: between
70374 and 70888 Improved Ghost Wolf moved from Enhancement's second row to its fourth and the hash
stayed `f3647be8…`. Whether it changes when a node is added is unknown (no export on both sides of
one), so a class may need pinning again after a patch.

**What the importer does.**

- Refuses (`DEFAULT-05` warning with the reason; preset talents used) when: a character is not
  base64; the version is not 1 or 2; the string ends before the node list does; a bit is set past the
  last known node; a selected node is one the engine's trees lack (parked/retired) or a choice node; a
  rank is above the engine's maximum; the result is over 51 points or breaks the tree rules (5 points
  per row, prerequisites at their maximum). A misaligned read almost always trips one of these. When
  the hash is a verified one, a rules failure is reported as a build the current tree forbids
  (talents moved since the export), not as a table mismatch; the level 20 shaman export is such a case.
- Converts silently when the class's tree hash and spec are in `VERIFIED_TREES`.
- Otherwise converts and emits a `TALENT-08` warning on `talents`: the layout is unconfirmed and the
  build should be checked in the Talents tab (which shows the converted tree).

**To verify another class:** add the real export to `fixtures/import/real/` (names and realm
replaced) and to `loadouts.json`, check the decoded build against the character in game (or its
stats), then add its hash and spec (`loadoutToTalents(...).header`) to `VERIFIED_TREES`; the tests
require the two lists to match. **To refresh the node table:** download
`engine/dbc/generated/trait_data.inc` at a newer `simulationcraft/simc-forever` commit and rerun the
script (`--trait-data <file> --commit <sha>`), then refresh the Wowhead fixture if the trees changed.

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
