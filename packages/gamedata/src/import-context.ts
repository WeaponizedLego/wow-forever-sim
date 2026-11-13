import type { ImportContext } from '@fsim/contracts';
import type { GameDatabase } from './database';

/**
 * What importers may ask about the data build. An enchant id may be its effect, item or spell id.
 * `enchantIdForSpell` maps a spell id (what Wowhead planner links store) to the enchant's effect id.
 */
export function toImportContext(db: GameDatabase, dataBuild: string): Required<ImportContext> {
  return {
    hasItem: (itemId) => db.items.has(itemId),
    hasEnchant: (enchantId) => db.hasEnchantId(enchantId),
    enchantIdForSpell: (spellId) => db.enchantIdForSpell(spellId),
    isRandomSuffixFor: (itemId, suffixId) =>
      db.items.get(itemId)?.randomSuffixOptions.includes(suffixId) ?? false,
    dataBuild,
  };
}
