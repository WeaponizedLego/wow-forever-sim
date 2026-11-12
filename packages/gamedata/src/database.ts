// Decodes the engine's game database (db.bin, a UIDatabase proto) and indexes it for lookups.
import type { ItemRandomSuffix, ItemSlot, PresetEncounter, ScalingItemProperties } from '@fsim/proto/common';
import type { Consumable, ItemEffectRandPropPoints } from '@fsim/proto/db';
import type { SpellEffect } from '@fsim/proto/spell';
import {
  UIDatabase,
  type UIEnchant,
  type UIFaction,
  type UIItem,
  type UINPC,
  type UIZone,
} from '@fsim/proto/ui';
import { enchantAppliesToItem, enchantSlots, itemSlots } from './slots';

/**
 * Decodes `db.bin` and, optionally, `leftover_db.bin`, and merges them the way upstream does
 * (`assets/database/loader.go`: `proto.Merge`, which appends every repeated field). When an id appears in both,
 * the lookups keep the leftover's row, as upstream's UI does when it loads leftovers on top.
 */
export function loadDatabase(main: Uint8Array, leftover?: Uint8Array): GameDatabase {
  const db = UIDatabase.fromBinary(main);
  if (leftover && leftover.length > 0) {
    const extra = UIDatabase.fromBinary(leftover);
    for (const key of Object.keys(extra) as (keyof UIDatabase)[]) {
      const target = db[key] as unknown[];
      target.push(...(extra[key] as unknown[]));
    }
  }
  return new GameDatabase(db);
}

/** The scaling variant with the highest key: the item's stats, ilvl and weapon damage upstream shows and uses for EP. */
export function maxScaling(item: UIItem): ScalingItemProperties | undefined {
  let best: number | undefined;
  for (const k of Object.keys(item.scalingOptions)) {
    const n = Number(k);
    if (best === undefined || n > best) best = n;
  }
  return best === undefined ? undefined : item.scalingOptions[best];
}

/** The item level upstream shows: its highest scaling variant's, else the item's own. */
export const itemLevel = (item: UIItem): number => maxScaling(item)?.ilvl || item.ilvl;

export class GameDatabase {
  readonly items = new Map<number, UIItem>();
  readonly randomSuffixes = new Map<number, ItemRandomSuffix>();
  readonly consumables = new Map<number, Consumable>();
  readonly spellEffects = new Map<number, SpellEffect>();
  /** Keyed by item level. */
  readonly itemEffectRandPropPoints = new Map<number, ItemEffectRandPropPoints>();
  readonly zones = new Map<number, UIZone>();
  readonly npcs = new Map<number, UINPC>();
  readonly factions = new Map<number, UIFaction>();
  readonly encounters = new Map<string, PresetEncounter>();
  private readonly enchantsByEffect = new Map<number, UIEnchant[]>();
  private readonly enchantsBySlot = new Map<ItemSlot, UIEnchant[]>();
  /** Effect, item and spell ids of every enchant: what an import may call an enchant by. */
  private readonly enchantAnyIds = new Set<number>();

  constructor(readonly raw: UIDatabase) {
    for (const item of raw.items) this.items.set(item.id, item);
    for (const s of raw.randomSuffixes) this.randomSuffixes.set(s.id, s);
    for (const c of raw.consumables) this.consumables.set(c.id, c);
    for (const e of raw.spellEffects) this.spellEffects.set(e.id, e);
    for (const r of raw.itemEffectRandPropPoints) this.itemEffectRandPropPoints.set(r.ilvl, r);
    for (const z of raw.zones) this.zones.set(z.id, z);
    for (const n of raw.npcs) this.npcs.set(n.id, n);
    for (const f of raw.factions) this.factions.set(f.id, f);
    for (const e of raw.encounters) this.encounters.set(e.path, e);
    for (const enchant of raw.enchants) {
      push(this.enchantsByEffect, enchant.effectId, enchant);
      for (const slot of new Set(enchantSlots(enchant))) push(this.enchantsBySlot, slot, enchant);
      for (const id of [enchant.effectId, enchant.itemId, enchant.spellId])
        if (id) this.enchantAnyIds.add(id);
    }
  }

  get enchants(): readonly UIEnchant[] {
    return this.raw.enchants;
  }

  item(id: number): UIItem | undefined {
    return this.items.get(id);
  }

  enchantsByEffectId(effectId: number): readonly UIEnchant[] {
    return this.enchantsByEffect.get(effectId) ?? [];
  }

  /** Enchants that fit a slot (before item-specific rules; see `enchantsForItem`). */
  enchantsForSlot(slot: ItemSlot): readonly UIEnchant[] {
    return this.enchantsBySlot.get(slot) ?? [];
  }

  /** Enchants that can go on this item. */
  enchantsForItem(item: UIItem): UIEnchant[] {
    const seen = new Set<UIEnchant>();
    for (const slot of itemSlots(item)) for (const e of this.enchantsForSlot(slot)) seen.add(e);
    return [...seen].filter((e) => enchantAppliesToItem(e, item));
  }

  /**
   * The effect id of the enchant its spell casts (upstream `enchantSpellIdToEnchant`), or undefined when no
   * enchant has that spell id.
   */
  enchantIdForSpell(spellId: number): number | undefined {
    if (!spellId) return undefined;
    return this.raw.enchants.find((e) => e.spellId === spellId)?.effectId;
  }

  /** Whether any enchant has this effect, item or spell id. */
  hasEnchantId(id: number): boolean {
    return this.enchantAnyIds.has(id);
  }

  /**
   * The enchant an id names on an item: effect, item or spell id, as upstream `lookupItemSpec` matches it.
   * Rows sharing an effect id can differ in the items they fit, so the one that applies to the item wins.
   */
  findEnchant(id: number, item?: UIItem): UIEnchant | undefined {
    if (!id) return undefined;
    const candidates = item
      ? itemSlots(item).flatMap((s) => this.enchantsForSlot(s))
      : (this.raw.enchants as UIEnchant[]);
    const matches = candidates.filter((e) => e.effectId === id || e.itemId === id || e.spellId === id);
    return (item && matches.find((e) => enchantAppliesToItem(e, item))) || matches[0];
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
