// Builds the per-player SimDatabase subset the engine needs. lib.wasm carries no item data, so
// every Player in a request must bring the rows it uses. Ported from upstream (MIT):
// ui/sim/proto/gear.ts toDatabase(), ui/sim/player/player.ts toDatabase(),
// ui/sim/proto/database.ts mergeSimDatabases(), ui/sim/proto/buff_items.ts addPartyBuffItems() and
// ui/sim/proto/proto_migration.ts extendPlayerProtoWithMissingEffects().
import type { Player, RaidSimRequest, StatWeightsRequest } from '@fsim/proto/api';
import type { PartyBuffs } from '@fsim/proto/buffs';
import type { ItemRandomSuffix, ItemSpec } from '@fsim/proto/common';
import {
  SimDatabase,
  SimEnchant,
  SimItem,
  type Consumable,
  type ItemEffectRandPropPoints,
} from '@fsim/proto/db';
import type { SpellEffect } from '@fsim/proto/spell';
import { UIEnchant, UIItem, type UIDatabase } from '@fsim/proto/ui';

/** Lookup tables over a UIDatabase, built once per database object. */
export interface UIDatabaseIndex {
  items: Map<number, UIItem>;
  enchantsByEffectId: Map<number, UIEnchant[]>;
  randomSuffixes: Map<number, ItemRandomSuffix>;
  randPropPointsByIlvl: Map<number, ItemEffectRandPropPoints>;
  consumables: Map<number, Consumable>;
  spellEffects: Map<number, SpellEffect>;
}

const indexCache = new WeakMap<UIDatabase, UIDatabaseIndex>();

export function indexUIDatabase(db: UIDatabase): UIDatabaseIndex {
  let idx = indexCache.get(db);
  if (idx) return idx;
  const enchantsByEffectId = new Map<number, UIEnchant[]>();
  for (const e of db.enchants) {
    const rows = enchantsByEffectId.get(e.effectId);
    if (rows) rows.push(e);
    else enchantsByEffectId.set(e.effectId, [e]);
  }
  idx = {
    items: new Map(db.items.map((i) => [i.id, i])),
    enchantsByEffectId,
    randomSuffixes: new Map(db.randomSuffixes.map((s) => [s.id, s])),
    randPropPointsByIlvl: new Map(db.itemEffectRandPropPoints.map((p) => [p.ilvl, p])),
    consumables: new Map(db.consumables.map((c) => [c.id, c])),
    spellEffects: new Map(db.spellEffects.map((s) => [s.id, s])),
  };
  indexCache.set(db, idx);
  return idx;
}

const asIndex = (db: UIDatabase | UIDatabaseIndex): UIDatabaseIndex =>
  db.items instanceof Map ? (db as UIDatabaseIndex) : indexUIDatabase(db as UIDatabase);

/**
 * Items the sim reads for a party buff (upstream PARTY_BUFF_ITEM_IDS): without the full item
 * database it knows only the items the request carries.
 */
export const PARTY_BUFF_ITEM_IDS: Partial<Record<keyof PartyBuffs, readonly number[]>> = {
  darkspear: [12802],
};

// Same conversions as upstream: protojson round trip, dropping the UI-only fields.
const itemToSim = (item: UIItem) => SimItem.fromJson(UIItem.toJson(item), { ignoreUnknownFields: true });
const enchantToSim = (e: UIEnchant) =>
  SimEnchant.fromJson(UIEnchant.toJson(e), { ignoreUnknownFields: true });

/** Every consumable id a ConsumesSpec names: its scalar `*_id` fields and its id lists. */
export function consumableIds(player: Player): number[] {
  const ids = new Set<number>();
  for (const v of Object.values(player.consumables ?? {}) as unknown[]) {
    if (typeof v === 'number' && v) ids.add(v);
    else if (Array.isArray(v)) for (const id of v) if (typeof id === 'number' && id) ids.add(id);
  }
  return [...ids];
}

/**
 * The SimDatabase subset one player needs:
 * - equipped and item-swap items, every enchant row of their enchants' effect ids, their random
 *   suffixes and the item-effect rand-prop points of their item levels;
 * - items of active party buffs (Darkspear);
 * - the consumables its ConsumesSpec names and those consumables' spell effects.
 *
 * Ids the UIDatabase does not hold are skipped; the engine then reports them.
 */
export function buildPlayerDatabase(
  player: Player,
  db: UIDatabase | UIDatabaseIndex,
  partyBuffs?: PartyBuffs,
): SimDatabase {
  const idx = asIndex(db);
  const out = SimDatabase.create();
  const seenItems = new Set<number>();
  const seenEnchants = new Set<number>();
  const seenSuffixes = new Set<number>();
  const seenIlvls = new Set<number>();

  const addItem = (id: number) => {
    const item = idx.items.get(id);
    if (!item || seenItems.has(id)) return item;
    seenItems.add(id);
    out.items.push(itemToSim(item));
    // Upstream EquippedItem.ilvl: the item level of the base scaling option.
    const ilvl = item.scalingOptions[0]?.ilvl ?? item.ilvl;
    const rpp = idx.randPropPointsByIlvl.get(ilvl);
    if (rpp && !seenIlvls.has(ilvl)) {
      seenIlvls.add(ilvl);
      out.itemEffectRandPropPoints.push(rpp);
    }
    return item;
  };

  const addSpec = (spec: ItemSpec) => {
    if (!spec.id || !addItem(spec.id)) return;
    if (spec.randomSuffix && !seenSuffixes.has(spec.randomSuffix)) {
      const suffix = idx.randomSuffixes.get(spec.randomSuffix);
      if (suffix) {
        seenSuffixes.add(suffix.id);
        out.randomSuffixes.push(suffix);
      }
    }
    if (spec.enchant && !seenEnchants.has(spec.enchant)) {
      seenEnchants.add(spec.enchant);
      // Rows sharing an effect id differ only in slot rules; the engine picks the one that fits.
      for (const e of idx.enchantsByEffectId.get(spec.enchant) ?? []) out.enchants.push(enchantToSim(e));
    }
  };

  for (const spec of player.equipment?.items ?? []) addSpec(spec);
  for (const spec of player.itemSwap?.items ?? []) addSpec(spec);
  for (const [buff, ids] of Object.entries(PARTY_BUFF_ITEM_IDS)) {
    if (partyBuffs?.[buff as keyof PartyBuffs]) for (const id of ids ?? []) addItem(id);
  }

  const seenEffects = new Set<number>();
  for (const id of consumableIds(player)) {
    const c = idx.consumables.get(id);
    if (!c) continue;
    out.consumables.push(c);
    for (const eid of c.effectIds) {
      const effect = idx.spellEffects.get(eid);
      if (effect && !seenEffects.has(eid)) {
        seenEffects.add(eid);
        out.spellEffects.push(effect);
      }
    }
  }
  return out;
}

/** A copy of `req` with every player's `database` rebuilt from `db`. */
export function withDatabases(req: RaidSimRequest, db: UIDatabase | UIDatabaseIndex): RaidSimRequest {
  const idx = asIndex(db);
  if (!req.raid) return req;
  return {
    ...req,
    raid: {
      ...req.raid,
      parties: req.raid.parties.map((party) => ({
        ...party,
        players: party.players.map((p) => ({ ...p, database: buildPlayerDatabase(p, idx, party.buffs) })),
      })),
    },
  };
}

/** A copy of a stat-weights request with its player's `database` rebuilt from `db`. */
export function withStatWeightsDatabase(
  req: StatWeightsRequest,
  db: UIDatabase | UIDatabaseIndex,
): StatWeightsRequest {
  if (!req.player) return req;
  return { ...req, player: { ...req.player, database: buildPlayerDatabase(req.player, db, req.partyBuffs) } };
}
