// Pre-sim guard: gear the loaded game data does not know. The engine panics on an item or enchant id it
// has no record of ("No item with id: N"), which stops the whole sim. Presets and share links can name
// items newer than the staged engine's data (they drift between engine syncs), so `characterToPlayer`
// leaves these out of the request and the screens list them (`missingGameData`) instead.
import { ITEM_SLOTS, type Character, type ItemSlotId } from '@fsim/contracts';
import type { GameDatabase } from './database';

export interface MissingGameData {
  slot: ItemSlotId;
  kind: 'item' | 'enchant';
  id: number;
}

/** Whether the data has this item. */
export const knowsItem = (db: GameDatabase, itemId: number): boolean => !!db.item(itemId);

/** Whether the data has an enchant by this effect, item or spell id (what the request builder resolves). */
export const knowsEnchant = (db: GameDatabase, enchantId: number): boolean => db.hasEnchantId(enchantId);

/**
 * Items and enchants on the character that the data does not have, in slot order. An enchant on a missing
 * item is not listed apart: the whole item is left out.
 */
export function missingGameData(character: Pick<Character, 'gear'>, db: GameDatabase): MissingGameData[] {
  const out: MissingGameData[] = [];
  for (const slot of ITEM_SLOTS) {
    const g = character.gear[slot];
    if (!g) continue;
    if (!knowsItem(db, g.itemId)) out.push({ slot, kind: 'item', id: g.itemId });
    else if (g.enchantId && !knowsEnchant(db, g.enchantId))
      out.push({ slot, kind: 'enchant', id: g.enchantId });
  }
  return out;
}
