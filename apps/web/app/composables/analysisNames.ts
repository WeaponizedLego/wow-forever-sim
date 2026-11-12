// Display names for engine action ids. Spell names come from the game data's spell icon table and
// item names from its items; anything not found shows as "Spell 12345" / "Item 12345". Nothing is
// made up: the only fixed labels are the engine's own OtherAction ids (melee, shoot, regen, …).
import type { ParsedActionId } from '@fsim/analysis';
import type { GameDatabase } from '@fsim/gamedata';
import { OtherAction } from '@fsim/proto/common';
import type { Quality } from './ui-types';
import { ItemQuality } from '@fsim/proto/common';

const OTHER: Partial<Record<OtherAction, string>> = {
  [OtherAction.OtherActionAttack]: 'Melee',
  [OtherAction.OtherActionShoot]: 'Shoot',
  [OtherAction.OtherActionManaRegen]: 'Mana regen',
  [OtherAction.OtherActionEnergyRegen]: 'Energy regen',
  [OtherAction.OtherActionFocusRegen]: 'Focus regen',
  [OtherAction.OtherActionManaGain]: 'Mana gain',
  [OtherAction.OtherActionRageGain]: 'Rage gain',
  [OtherAction.OtherActionPet]: 'Pet',
  [OtherAction.OtherActionRefund]: 'Refund',
  [OtherAction.OtherActionWait]: 'Wait',
};
/** The engine tags auto attacks 1 (main hand) and 2 (off hand). */
const HAND: Record<number, string> = { 1: 'main hand', 2: 'off hand' };

const QUALITY: Partial<Record<ItemQuality, Quality>> = {
  [ItemQuality.ItemQualityCommon]: 'common',
  [ItemQuality.ItemQualityUncommon]: 'uncommon',
  [ItemQuality.ItemQualityRare]: 'rare',
  [ItemQuality.ItemQualityEpic]: 'epic',
  [ItemQuality.ItemQualityLegendary]: 'legendary',
  [ItemQuality.ItemQualityArtifact]: 'legendary',
  [ItemQuality.ItemQualityHeirloom]: 'legendary',
};
export const qualityOf = (q: ItemQuality | undefined): Quality =>
  q === undefined ? 'common' : (QUALITY[q] ?? 'common');

const db = shallowRef<GameDatabase | null>(null);
let spellNames: Map<number, string> | null = null;
let spellRanks: Map<number, number> | null = null;

/** Reactive name lookup; names fill in once the game data has loaded. */
export function useActionNames() {
  if (!db.value)
    void useEngine()
      .gameDatabase()
      .then((d) => {
        spellNames = new Map(d.raw.spellIcons.map((s) => [s.id, s.name]));
        spellRanks = new Map(d.raw.spellIcons.filter((s) => s.rank > 0).map((s) => [s.id, s.rank]));
        db.value = d;
      })
      .catch(() => {});

  function actionName(id: ParsedActionId): string {
    if (id.kind === 'other') {
      const base = OTHER[id.id as OtherAction] ?? `Other ${id.id}`;
      return id.id === OtherAction.OtherActionAttack && HAND[id.tag] ? `${base} · ${HAND[id.tag]}` : base;
    }
    if (id.kind === 'item') return db.value?.item(id.id)?.name || `Item ${id.id}`;
    // Read db.value so callers re-render when the data arrives.
    return (db.value && spellNames?.get(id.id)) || `Spell ${id.id}`;
  }

  /**
   * Names for a list of ids. Where two rows would read the same, the spell rank (from the game data) or
   * the engine's tag is added: "Lightning Bolt (rank 9)", "Lightning Bolt (tag 6)".
   */
  function distinctNames(ids: readonly ParsedActionId[]): string[] {
    const names = ids.map(actionName);
    const rankOf = (id: ParsedActionId) => (id.kind === 'spell' ? spellRanks?.get(id.id) : undefined);
    const groups = new Map<string, number[]>();
    names.forEach((n, i) => groups.set(n, [...(groups.get(n) ?? []), i]));
    return names.map((n, i) => {
      const group = groups.get(n)!;
      if (group.length < 2) return n;
      const id = ids[i]!;
      const parts: string[] = [];
      const rank = rankOf(id);
      if (rank && new Set(group.map((j) => rankOf(ids[j]!))).size > 1) parts.push(`rank ${rank}`);
      if (id.tag && new Set(group.map((j) => ids[j]!.tag)).size > 1) parts.push(`tag ${id.tag}`);
      return parts.length ? `${n} (${parts.join(', ')})` : n;
    });
  }

  /** Item name, with the random suffix ("of the Boar") when one is given and known. */
  function itemName(itemId: number, randomSuffix?: number): string {
    const name = db.value?.item(itemId)?.name || `Item ${itemId}`;
    const suffix = randomSuffix ? db.value?.randomSuffixes.get(randomSuffix)?.name : undefined;
    return suffix ? `${name} ${suffix}` : name;
  }
  function itemQuality(itemId: number): Quality {
    return qualityOf(db.value?.item(itemId)?.quality);
  }

  return { db, actionName, distinctNames, itemName, itemQuality };
}
