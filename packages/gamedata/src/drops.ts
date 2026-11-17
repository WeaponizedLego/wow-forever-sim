// Droptimizer data: the dungeons and raids that have loot, who in them drops what, and which of those drops a
// character could wear.
//
// Dungeon or raid comes from the drop sources, not the zone: `UIZone.areaTypes` is terrain (forest, cavernous,
// …), so a zone is a raid when any drop in it is marked `DifficultyRaid`, a dungeon when its drops are marked
// `DifficultyDungeon`, and an open-world zone (drops with no difficulty) is not an instance at all.
// Loot sources are the NPC (a boss, or a chest NPC like BRD's Dark Coffer) or, without one, the source's
// `otherName` ("Trash", "Multiple NPCs", "Sothos and Jarien's Heirlooms"). A boss row whose `category` is
// "Trash" (AQ20's trash around General Rajaxx) counts as the zone's trash. Other categories (AQ40's Twin
// Emperors split per emperor, BRD's Hurley Blackbreath event) stay with their NPC.
import type { ClassId, ItemSlotId, SpecId } from '@fsim/contracts';
import { ItemType, PseudoStat } from '@fsim/proto/common';
import { DungeonDifficulty, type UIItem } from '@fsim/proto/ui';
import { maxScaling, type GameDatabase } from './database';
import { requiredLevel, sameItemKey } from './search';
import { canEquip, itemSlots, slotId } from './slots';
import { weightStatsFor } from './weight-stats';

export type InstanceKind = 'raid' | 'dungeon';
export type LootSourceKind = 'boss' | 'trash' | 'other';

export interface LootSource {
  /** Stable within an instance: `npc:11502`, `other:Trash`. */
  key: string;
  name: string;
  kind: LootSourceKind;
  npcId: number | null;
  /** Distinct items it drops (duplicate ids of one item listed once), for any class. */
  itemIds: number[];
}

export interface Instance {
  zoneId: number;
  name: string;
  kind: InstanceKind;
  /** Bosses by name, then trash, then other sources. */
  sources: LootSource[];
}

const TRASH = 'Trash';
const KIND_ORDER: readonly LootSourceKind[] = ['boss', 'trash', 'other'];

const cache = new WeakMap<GameDatabase, Instance[]>();

/** Every dungeon and raid with loot: raids first, then dungeons, each by name. Cached per database. */
export function lootInstances(db: GameDatabase): Instance[] {
  const hit = cache.get(db);
  if (hit) return hit;

  // One id per distinct item: the lowest id stands for its duplicates (Forever's re-adds of old items).
  const canonical = new Map<string, number>();
  const idFor = (item: UIItem) => {
    const key = sameItemKey(item);
    const kept = canonical.get(key);
    if (kept === undefined || item.id < kept) canonical.set(key, item.id);
    return key;
  };

  interface Draft {
    raid: boolean;
    dungeon: boolean;
    sources: Map<string, { name: string; kind: LootSourceKind; npcId: number | null; keys: Set<string> }>;
  }
  const zones = new Map<number, Draft>();
  for (const item of db.items.values()) {
    if (!itemSlots(item).length) continue;
    for (const s of item.sources) {
      if (s.source.oneofKind !== 'drop') continue;
      const d = s.source.drop;
      if (!d.zoneId || d.difficulty === DungeonDifficulty.DifficultyUnknown) continue;
      let z = zones.get(d.zoneId);
      if (!z) zones.set(d.zoneId, (z = { raid: false, dungeon: false, sources: new Map() }));
      if (d.difficulty === DungeonDifficulty.DifficultyRaid) z.raid = true;
      else z.dungeon = true;

      let key: string;
      let name: string;
      let kind: LootSourceKind;
      let npcId: number | null = null;
      if (d.category === TRASH || (!d.npcId && d.otherName === TRASH)) {
        key = `other:${TRASH}`;
        name = TRASH;
        kind = 'trash';
      } else if (d.npcId) {
        key = `npc:${d.npcId}`;
        name = db.npcs.get(d.npcId)?.name.trim() || `NPC ${d.npcId}`;
        kind = 'boss';
        npcId = d.npcId;
      } else {
        const other = d.otherName.trim() || 'Unknown source';
        key = `other:${other}`;
        name = other;
        kind = 'other';
      }
      let src = z.sources.get(key);
      if (!src) z.sources.set(key, (src = { name, kind, npcId, keys: new Set() }));
      src.keys.add(idFor(item));
    }
  }

  const out: Instance[] = [];
  for (const [zoneId, z] of zones) {
    const sources = [...z.sources]
      .map(([key, s]): LootSource => ({
        key,
        name: s.name,
        kind: s.kind,
        npcId: s.npcId,
        itemIds: [...s.keys].map((k) => canonical.get(k)!).sort((a, b) => a - b),
      }))
      .sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name),
      );
    out.push({
      zoneId,
      name: db.zones.get(zoneId)?.name || `Zone ${zoneId}`,
      kind: z.raid ? 'raid' : 'dungeon',
      sources,
    });
  }
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'raid' ? -1 : 1));
  cache.set(db, out);
  return out;
}

export function lootInstance(db: GameDatabase, zoneId: number): Instance | undefined {
  return lootInstances(db).find((i) => i.zoneId === zoneId);
}

/**
 * The distinct items that drop in a zone from the given sources (keys from `LootSource.key`; all sources when
 * omitted), each with the sources that drop it. Ordered by item id.
 */
export function instanceDrops(
  db: GameDatabase,
  zoneId: number,
  sourceKeys?: readonly string[],
): { item: UIItem; sources: LootSource[] }[] {
  const inst = lootInstance(db, zoneId);
  if (!inst) return [];
  const wanted = sourceKeys ? new Set(sourceKeys) : undefined;
  const byItem = new Map<number, LootSource[]>();
  for (const s of inst.sources) {
    if (wanted && !wanted.has(s.key)) continue;
    for (const id of s.itemIds) {
      const list = byItem.get(id);
      if (list) list.push(s);
      else byItem.set(id, [s]);
    }
  }
  return [...byItem]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([id, sources]) => {
      const item = db.item(id);
      return item ? [{ item, sources }] : [];
    });
}

export interface DropWearer {
  class: ClassId;
  spec: SpecId;
  level: number;
}

/** Why a drop is not a candidate for this character. */
export type DropSkipReason = 'class' | 'level' | 'stats' | 'random-suffix';

export interface UsableDrop {
  item: UIItem;
  /** Every slot the character may wear it in: both rings, both trinkets, main and off hand for dual wielders. */
  slots: ItemSlotId[];
}

const WEAPON_DPS: ReadonlySet<PseudoStat> = new Set([
  PseudoStat.PseudoStatMainHandDps,
  PseudoStat.PseudoStatOffHandDps,
  PseudoStat.PseudoStatRangedDps,
]);

/**
 * Whether the item could matter to the spec: it has a stat or pseudo-stat the spec's stat weights list, an
 * effect (proc, on-use, aura), a set bonus, or it is a weapon and the spec values weapon damage. A spirit and
 * stamina ring for a rogue, or a strength two-hander for a mage, does not.
 */
export function valuedBySpec(item: UIItem, spec: SpecId): boolean {
  if (item.itemEffects.length > 0 || item.setId || item.setName) return true;
  const w = weightStatsFor(spec);
  const weapon = item.type === ItemType.ItemTypeWeapon || item.type === ItemType.ItemTypeRanged;
  if (weapon && w.pseudoStats.some((p) => WEAPON_DPS.has(p))) return true;
  const scaling = maxScaling(item)?.stats;
  for (const s of w.stats) if ((item.stats[s] ?? 0) > 0 || (scaling?.[s] ?? 0) > 0) return true;
  for (const p of w.pseudoStats) if (!WEAPON_DPS.has(p) && (item.pseudoStats[p] ?? 0) > 0) return true;
  return false;
}

/**
 * Splits drops into the ones a character could wear and the rest, with the reason. Checks, in order: class
 * (armor type, weapon types, class allowlist, dual wield for the off hand), required level, the spec's stat
 * weights (`valuedBySpec`), and random-suffix items (the suffix that drops is unknown, so they cannot be simmed
 * as one item).
 */
export function usableDrops(
  items: readonly UIItem[],
  who: DropWearer,
): { usable: UsableDrop[]; skipped: { item: UIItem; reason: DropSkipReason }[] } {
  const usable: UsableDrop[] = [];
  const skipped: { item: UIItem; reason: DropSkipReason }[] = [];
  for (const item of items) {
    const slots = itemSlots(item)
      .filter((s) => canEquip(item, who, s))
      .map(slotId);
    if (!itemSlots(item).length) continue; // not gear
    let reason: DropSkipReason | undefined;
    if (!slots.length) reason = 'class';
    else if (requiredLevel(item) > who.level) reason = 'level';
    else if (!valuedBySpec(item, who.spec)) reason = 'stats';
    else if (item.randomSuffixOptions.length > 0) reason = 'random-suffix';
    if (reason) skipped.push({ item, reason });
    else usable.push({ item, slots });
  }
  return { usable, skipped };
}
