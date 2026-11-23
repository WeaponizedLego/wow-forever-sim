// Display names for engine action ids. Spell names come from the game data's spell icon table plus the
// engine's own spell table (extracted at the lock commit, loaded lazily: see @fsim/gamedata spell-names),
// item names from its items and consumables. What a tag adds (the hand, the spell that granted an extra
// attack, a queued swing, ...) follows @fsim/gamedata action-names, mirrored from upstream's UI. Nothing is
// made up, and a raw tag is never shown.
import type { ParsedActionId } from '@fsim/analysis';
import {
  actionName as nameAction,
  actionNameSources,
  buildSpellNames,
  distinctActionNames,
  loadSpellNames,
  talentIconUrl,
  type GameDatabase,
  type SpellName,
} from '@fsim/gamedata';
import type { Quality } from './ui-types';
import { ItemQuality } from '@fsim/proto/common';

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

  const sources = computed(() => actionNameSources(db.value, spells.value));

  /** "Melee (main hand)", "Heroic Strike (queued)", "Goblin Sapper Charge (self)". */
  function actionName(id: ParsedActionId): string {
    return nameAction(id, sources.value);
  }

  /** Small Wowhead icon URL for a spell or item, or null when the data has none. */
  function actionIcon(id: ParsedActionId): string | null {
    const icon =
      id.kind === 'spell'
        ? spells.value?.get(id.id)?.icon
        : id.kind === 'item'
          ? db.value?.item(id.id)?.icon || db.value?.consumables.get(id.id)?.icon
          : undefined;
    return icon ? talentIconUrl(icon, 'small') : null;
  }

  /**
   * Names for a list of ids. Same-named rows are told apart by spell rank where it differs, else by count
   * ("Whirlwind (2)"), never by the raw tag. `owners` (pet names, null for the player) keeps the rows of
   * different units apart, as the caller adds the owner.
   */
  function distinctNames(ids: readonly ParsedActionId[], owners?: readonly (string | null)[]): string[] {
    return distinctActionNames(ids, sources.value, owners);
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

  return { db, sources, actionName, actionIcon, distinctNames, itemName, itemQuality };
}
