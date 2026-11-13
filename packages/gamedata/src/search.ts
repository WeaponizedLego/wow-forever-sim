// The item picker's search: text on the name plus slot, class/spec usability, quality, item level and source
// filters. Built once per database; a query is a linear scan over precomputed rows (≈ 11k items, well under 5 ms).
import type { ClassId, ItemSlotId, SpecId } from '@fsim/contracts';
import type { ItemQuality } from '@fsim/proto/common';
import type { UIItem } from '@fsim/proto/ui';
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
  /** Hides items that need a higher character level. */
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

interface Row {
  item: UIItem;
  name: string;
  slotMask: number;
  ilvl: number;
  sourceMask: number;
  zones: readonly number[];
  npcs: readonly number[];
}

export class ItemSearchIndex {
  private readonly rows: Row[];

  constructor(db: GameDatabase) {
    this.rows = [...db.items.values()].map((item) => {
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
        sourceMask,
        zones,
        npcs,
      };
    });
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
      if (q.maxRequiredLevel !== undefined && r.item.reqLvl > q.maxRequiredLevel) continue;
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
