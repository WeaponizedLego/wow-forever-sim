// Where an item comes from: kinds for filtering and a short label for the gear table's source column
// ("Molten Core · Ragnaros", "Crafted · Blacksmithing").
import { Profession } from '@fsim/proto/common';
import { DungeonDifficulty, RepLevel, type UIItemSource } from '@fsim/proto/ui';
import type { GameDatabase } from './database';

export const SOURCE_KINDS = [
  'raid',
  'dungeon',
  'world',
  'crafted',
  'quest',
  'vendor',
  'reputation',
  'pvp',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Bit for a kind in a source mask. */
export const sourceBit = (kind: SourceKind): number => 1 << SOURCE_KINDS.indexOf(kind);

/** The kind of one source. A drop with no dungeon or raid difficulty is a world drop (upstream's rule). */
export function sourceKind({ source }: UIItemSource): SourceKind | undefined {
  switch (source.oneofKind) {
    case 'crafted':
      return 'crafted';
    case 'quest':
      return 'quest';
    case 'soldBy':
      return 'vendor';
    case 'rep':
      return 'reputation';
    case 'pvp':
      return 'pvp';
    case 'drop':
      if (source.drop.difficulty === DungeonDifficulty.DifficultyRaid) return 'raid';
      if (source.drop.difficulty === DungeonDifficulty.DifficultyDungeon) return 'dungeon';
      return 'world';
    default:
      return undefined;
  }
}

/** Upstream's raid filter zones, by short name. */
export const RAID_ZONES = {
  MC: 2717,
  Ony: 2159,
  BWL: 2677,
  ZG: 1977,
  AQ20: 3429,
  AQ40: 3428,
  Naxx: 3456,
} as const;

const KIND_ORDER: readonly SourceKind[] = [
  'raid',
  'dungeon',
  'crafted',
  'quest',
  'reputation',
  'pvp',
  'vendor',
  'world',
];

/** One source as a short label. */
export function sourceLabel(db: GameDatabase, { source }: UIItemSource): string {
  switch (source.oneofKind) {
    case 'crafted':
      return `Crafted · ${Profession[source.crafted.profession] ?? 'Unknown'}`;
    case 'quest':
      return `Quest · ${source.quest.name || `#${source.quest.id}`}`;
    case 'soldBy':
      return `Vendor · ${source.soldBy.npcName || db.npcs.get(source.soldBy.npcId)?.name || 'Unknown'}`;
    case 'rep': {
      const faction = db.factions.get(source.rep.repFactionId)?.name ?? 'Reputation';
      const level = RepLevel[source.rep.repLevel]?.replace(/^RepLevel/, '') ?? '';
      return `${faction} · ${level}`.trim();
    }
    case 'pvp':
      return 'PvP';
    case 'drop': {
      const d = source.drop;
      const zone = db.zones.get(d.zoneId)?.name;
      const who = db.npcs.get(d.npcId)?.name ?? (d.otherName ? d.otherName.toLowerCase() : undefined);
      if (!zone) return who && who !== 'world drop' ? `World drop · ${who}` : 'World drop';
      return who ? `${zone} · ${who}` : zone;
    }
    default:
      return 'Unknown';
  }
}

/** The item's most telling source as a label (raid over dungeon over crafted …), or "—" when it has none. */
export function primarySourceLabel(db: GameDatabase, sources: readonly UIItemSource[]): string {
  let best: UIItemSource | undefined;
  let bestRank = Infinity;
  for (const s of sources) {
    const kind = sourceKind(s);
    const rank = kind ? KIND_ORDER.indexOf(kind) : KIND_ORDER.length;
    if (rank < bestRank) {
      best = s;
      bestRank = rank;
    }
  }
  return best ? sourceLabel(db, best) : '—';
}
