# Import fixtures (lane L3)

**None of these were captured from a real game client.** All are reconstructions built to the
real formats from the exporters' source (see `packages/importers/README.md` for sources). Replace
or add real captures when someone exports from a Forever character; keep these as regression cases.

| File                             | Format                                       | What it exercises                                                                                                                                                          |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `simc-fury-warrior.simc`         | SimC addon, Forever shape (`GetSimcProfile`) | `spec=unknown`, client loadout `talents=`, `legacy_talents`, `shirt`, bags, checksum; **unknown item** `shoulder=,id=99412` → `DATA-03`                                    |
| `simc-survival-hunter.simc`      | SimC addon, Forever shape                    | **malformed line** `waist,id=16680` → `PARSE-02`; `ammo` + `# ammo_count`, `ranged` after ammo, pet lines; `suffix=` on finger2 (not written by the real addon on Forever) |
| `simc-fire-mage.simc`            | SimC addon, Forever shape                    | caster; `race=skyborne_alliance`; `enchant_id=2650` not in the data build → `DATA-03`, item kept                                                                           |
| `simc-balance-druid-edited.simc` | Hand-edited SimC profile (not addon output)  | the shape the Start mockup shows: named `spec=balance`, engine digit `talents=`, `role=spell`, `potion=`, `gem_id`/`bonus_id`                                              |
| `wowsims-arms-warrior.json`      | WoWSims exporter JSON (`flavor: forever`)    | positional `gear.items` with a `null` off hand, `random_suffix`, `spec: "arms"`                                                                                            |
| `wowhead-sv-hunter.url`          | Wowhead planner link, hash version 3         | SV gear with enchants as spell ids, random suffix, a shirt slot (skipped); two Forever enchant spell ids > 65535 wrap in the 2-byte field → `DATA-03`                      |
| `wowhead-moonkin-druid.url`      | Wowhead planner link, hash version 3         | `windshaper-skyborne`, spec inferred from talents, unknown item and unknown enchant spell                                                                                  |
| `data-ids.json`                  | —                                            | item ids, enchant effect ids, enchant spell → effect map from upstream `db.json` at `b2047bf` (test `ImportContext`)                                                       |
| `expected/*.json`                | —                                            | golden `ImportResult` per fixture                                                                                                                                          |

Item and enchant ids come from upstream presets (`ui/specs/*/gear_sets`) and the Phase 0 SV
engine fixture. The SimC checksums are real adler32 values over the text before them. The
`talents=` loadout strings are syntactically valid base64 (version byte 2) but do not encode real
builds. The Wowhead hashes were written with a port of upstream's planner exporter (`writeHash`).
