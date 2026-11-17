// The item picker's search: text on the name plus slot, class/spec usability, quality, item level and source
// filters. Built once per database; a query is a linear scan over precomputed rows (≈ 11k items, well under 5 ms).
import type { ClassId, ItemSlotId, SpecId } from '@fsim/contracts';
import type { ItemQuality } from '@fsim/proto/common';
import { UIItem } from '@fsim/proto/ui';
import { itemLevel, type GameDatabase } from './database';
import { canEquip, itemSlots, slotProto } from './slots';
import { sourceBit, sourceKind, type SourceKind } from './sources';

export interface ItemQuery {
  /** Every whitespace-separated word must appear in the name (case-insensitive). */
  text?: string;
  slot?: ItemSlotId;
  /** Only items this class may equip (armor type, weapon and ranged types, class allowlist). */
  class?: ClassId;
  /** Narrows dual-wield rules for the off hand; implies nothing without `class`. */
  spec?: SpecId;
  qualities?: readonly ItemQuality[];
  minIlvl?: number;
  maxIlvl?: number;
  /** Hides items that need a higher character level (`requiredLevel`, which estimates missing data). */
  maxRequiredLevel?: number;
  /** Keeps items with at least one source of these kinds. Items with no known source pass only without this filter. */
  sources?: readonly SourceKind[];
  /** Keeps items that drop in this zone (raid or dungeon id from `db.zones`). */
  zoneId?: number;
  /** Keeps items that drop from this NPC (a boss). */
  npcId?: number;
  /** At most this many results (default 200). */
  limit?: number;
}

/** Highest character level in the game; an estimated required level never exceeds it. */
const MAX_LEVEL = 60;
/** In the data, items that list a required level have item level = required level + 5 (≈ 98% exactly). */
const ILVL_OVER_REQ = 5;

/**
 * The character level an item needs. The data's `reqLvl` when it is above 1. About 20% of items have 0
 * there although the game requires a level (quest rewards like Seal of Ascension, ilvl 61), and Forever's
 * own items (ids 27xxxx) mostly carry a placeholder 1 even at ilvl 62; for those the level is estimated from
 * the item level as `clamp(ilvl − 5, 1, 60)`, which leaves genuinely level-1 items (ilvl ≤ 6) at 1.
 *
 * On the items that do list `reqLvl` (2–59) the estimate is exact for ≈ 98% and within ±2 levels for ≈ 99%;
 * it errs high by 3+ levels for ≈ 0.2%, which a character at that level would wrongly not see.
 * Known misses: an item with no level requirement in game but a high item level (rare: some quest and
 * vendor items, tabards) is hidden from characters below ilvl − 5; and the 1–2 level error band above.
 */
export function requiredLevel(item: UIItem): number {
  if (item.reqLvl > 1) return item.reqLvl;
  return Math.min(MAX_LEVEL, Math.max(1, itemLevel(item) - ILVL_OVER_REQ));
}

interface Row {
  item: UIItem;
  name: string;
  slotMask: number;
  ilvl: number;
  reqLvl: number;
  sourceMask: number;
  zones: number[];
  npcs: number[];
}

/**
 * Everything about an item but its id, icon and sources. The data has the same item under several ids
 * (Forever's re-adds such as Sergeant's Cloak 16341 / 272451, Recruit's gear 40 / 6122, each Insignia of the
 * Horde twice); equal keys are listed once. Faction variants (Ironbark Staff 20069 / 20220) and quality tiers
 * (Vision of Voodress 19606 green / 19607 blue) differ in the key and stay separate.
 */
function sameItemKey(item: UIItem): string {
  const bytes = UIItem.toBinary({ ...item, id: 0, icon: '', sources: [] });
  let key = '';
  for (let i = 0; i < bytes.length; i += 4096) key += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return key;
}

export class ItemSearchIndex {
  private readonly rows: Row[];

  constructor(db: GameDatabase) {
    const rows = [...db.items.values()].map((item): Row => {
      let sourceMask = 0;
      const zones: number[] = [];
      const npcs: number[] = [];
      for (const s of item.sources) {
        const kind = sourceKind(s);
        if (kind) sourceMask |= sourceBit(kind);
        if (s.source.oneofKind === 'drop') {
          if (s.source.drop.zoneId) zones.push(s.source.drop.zoneId);
          if (s.source.drop.npcId) npcs.push(s.source.drop.npcId);
        }
      }
      let slotMask = 0;
      for (const slot of itemSlots(item)) slotMask |= 1 << slot;
      return {
        item,
        name: item.name.toLowerCase(),
        slotMask,
        ilvl: itemLevel(item),
        reqLvl: requiredLevel(item),
        sourceMask,
        zones,
        npcs,
      };
    });
    // One row per distinct item: the id with the most sources (then the lowest id) stands for its
    // duplicates, and carries all their sources so the source, zone and boss filters still find it.
    const byKey = new Map<string, Row>();
    rows.sort((a, b) => b.item.sources.length - a.item.sources.length || a.item.id - b.item.id);
    for (const r of rows) {
      const key = sameItemKey(r.item);
      const kept = byKey.get(key);
      if (!kept) {
        byKey.set(key, r);
        continue;
      }
      kept.sourceMask |= r.sourceMask;
      kept.zones.push(...r.zones);
      kept.npcs.push(...r.npcs);
    }
    this.rows = [...byKey.values()];
    // Best first: item level, then quality, then name.
    this.rows.sort(
      (a, b) => b.ilvl - a.ilvl || b.item.quality - a.item.quality || a.name.localeCompare(b.name),
    );
  }

  get size(): number {
    return this.rows.length;
  }

  search(q: ItemQuery): UIItem[] {
    const words = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const slot = q.slot === undefined ? undefined : slotProto(q.slot);
    const slotBit = slot === undefined ? 0 : 1 << slot;
    const qualities = q.qualities?.length ? new Set(q.qualities) : undefined;
    let sourceMask = 0;
    for (const k of q.sources ?? []) sourceMask |= sourceBit(k);
    const who = q.class ? { class: q.class, spec: q.spec } : undefined;
    const limit = q.limit ?? 200;
    const out: UIItem[] = [];
    for (const r of this.rows) {
      if (slotBit && !(r.slotMask & slotBit)) continue;
      if (q.minIlvl !== undefined && r.ilvl < q.minIlvl) continue;
      if (q.maxIlvl !== undefined && r.ilvl > q.maxIlvl) continue;
      if (qualities && !qualities.has(r.item.quality)) continue;
      if (q.maxRequiredLevel !== undefined && r.reqLvl > q.maxRequiredLevel) continue;
      if (sourceMask && !(r.sourceMask & sourceMask)) continue;
      if (q.zoneId !== undefined && !r.zones.includes(q.zoneId)) continue;
      if (q.npcId !== undefined && !r.npcs.includes(q.npcId)) continue;
      if (words.length && !words.every((w) => r.name.includes(w))) continue;
      if (who && !canEquip(r.item, who, slot)) continue;
      out.push(r.item);
      if (out.length >= limit) break;
    }
    return out;
  }
}
