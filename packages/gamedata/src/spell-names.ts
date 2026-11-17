// Names (and icons, where known) for the spell ids the engine reports in its ability and aura metrics.
//
// Two offline sources, both from upstream at the engine lock commit:
// - db.bin's `spellIcons` (id, name, rank, icon): about 2,000 spells, the ones upstream's UI shows;
// - data/spell-names/spell-names.json (id, name, rank), extracted by scripts/extract-spell-names.ts from the
//   engine's own spell table: every other spell the engine knows (Windfury Weapon's strike 439440, weapon
//   imbue procs, consumable auras, ...). It is ~57 kB gzipped, so it is loaded lazily with `loadSpellNames`.
// A spell only in the second table borrows the icon of a `spellIcons` spell with the same name, when one exists.

export interface SpellName {
  name: string;
  /** Spell rank, 0 when the spell has none. */
  rank: number;
  /** Icon name (`talentIconUrl` builds its URL), or '' when unknown. */
  icon: string;
}

/** [spell id, name, rank] rows of data/spell-names/spell-names.json. */
export type SpellNameRow = readonly [number, string, number];

interface SpellIconLike {
  id: number;
  name: string;
  icon: string;
  rank: number;
}

/** Joins db.bin's `spellIcons` with the extracted rows. `spellIcons` wins where both name a spell. */
export function buildSpellNames(
  spellIcons: readonly SpellIconLike[],
  extra: readonly SpellNameRow[] = [],
): Map<number, SpellName> {
  const out = new Map<number, SpellName>();
  const iconByName = new Map<string, string>();
  for (const s of spellIcons) {
    if (!s.name) continue;
    out.set(s.id, { name: s.name, rank: s.rank, icon: s.icon });
    if (s.icon && !iconByName.has(s.name)) iconByName.set(s.name, s.icon);
  }
  for (const [id, name, rank] of extra) {
    if (out.has(id) || !name) continue;
    out.set(id, { name, rank, icon: iconByName.get(name) ?? '' });
  }
  return out;
}

/** The extracted spell names. A separate chunk: call it when names are needed, not at start-up. */
export async function loadSpellNames(): Promise<readonly SpellNameRow[]> {
  const mod = (await import('../data/spell-names/spell-names.json')) as unknown as {
    default: { spells: SpellNameRow[] };
  };
  return mod.default.spells;
}
