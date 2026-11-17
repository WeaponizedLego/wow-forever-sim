// Display names for engine action ids. Spell names come from the game data's spell icon table plus the
// engine's own spell table (extracted at the lock commit, loaded lazily: see @fsim/gamedata spell-names),
// item names from its items; anything not found shows as "Spell 12345" / "Item 12345". Nothing is made
// up: the only fixed labels are the engine's own OtherAction ids (melee, shoot, regen, …).
import type { ParsedActionId } from '@fsim/analysis';
import {
  buildSpellNames,
  loadSpellNames,
  talentIconUrl,
  type GameDatabase,
  type SpellName,
} from '@fsim/gamedata';
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
export const qualityFromEnum = (q: ItemQuality | undefined): Quality =>
  q === undefined ? 'common' : (QUALITY[q] ?? 'common');

const db = shallowRef<GameDatabase | null>(null);
const spells = shallowRef<Map<number, SpellName> | null>(null);
let loading = false;

/** Loads the game data and the extracted spell names once. A failed spell-name chunk leaves db.bin's names. */
function load(): void {
  if (loading) return;
  loading = true;
  const extra = loadSpellNames().catch(() => []);
  void useEngine()
    .gameDatabase()
    .then(async (d) => {
      db.value = d;
      spells.value = buildSpellNames(d.raw.spellIcons);
      spells.value = buildSpellNames(d.raw.spellIcons, await extra);
    })
    .catch(() => {
      loading = false;
    });
}

/** Reactive name lookup; names fill in once the game data has loaded. */
export function useActionNames() {
  load();

  function actionName(id: ParsedActionId): string {
    if (id.kind === 'other') {
      const base = OTHER[id.id as OtherAction] ?? `Other ${id.id}`;
      return id.id === OtherAction.OtherActionAttack && HAND[id.tag] ? `${base} · ${HAND[id.tag]}` : base;
    }
    if (id.kind === 'item') return db.value?.item(id.id)?.name || `Item ${id.id}`;
    return spells.value?.get(id.id)?.name || `Spell ${id.id}`;
  }

  /** Small Wowhead icon URL for a spell or item, or null when the data has none. */
  function actionIcon(id: ParsedActionId): string | null {
    const icon =
      id.kind === 'spell'
        ? spells.value?.get(id.id)?.icon
        : id.kind === 'item'
          ? db.value?.item(id.id)?.icon
          : undefined;
    return icon ? talentIconUrl(icon, 'small') : null;
  }

  /**
   * Names for a list of ids. Where two rows would read the same, the spell rank (from the game data) or
   * the engine's tag is added: "Lightning Bolt (rank 9)", "Lightning Bolt (tag 6)".
   */
  function distinctNames(ids: readonly ParsedActionId[]): string[] {
    const names = ids.map(actionName);
    const rankOf = (id: ParsedActionId) =>
      id.kind === 'spell' ? spells.value?.get(id.id)?.rank || undefined : undefined;
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
    return qualityFromEnum(db.value?.item(itemId)?.quality);
  }

  return { db, actionName, actionIcon, distinctNames, itemName, itemQuality };
}
