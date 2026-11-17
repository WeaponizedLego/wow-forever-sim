import { describe, expect, it } from 'vitest';
import { characterFromPresets } from './character';
import { missingGameData } from './missing';
import { loadSpecPresets } from './presets';
import { buildRaidSimRequest } from './request';
import { fixtureDb } from './test-db';

const BOGUS_ITEM = 999_999_001;
const BOGUS_ENCHANT = 999_999_002;

describe('pre-sim guard', () => {
  it('lists items and enchants the data lacks, and leaves them out of the request', async () => {
    const presets = await loadSpecPresets('hunter');
    const base = characterFromPresets(presets, 'sv');
    const db = fixtureDb();
    expect(missingGameData(base, db)).toEqual([]);

    const head = base.gear.head!;
    const character = {
      ...base,
      gear: {
        ...base.gear,
        trinket1: { itemId: BOGUS_ITEM },
        head: { ...head, enchantId: BOGUS_ENCHANT },
      },
    };
    expect(missingGameData(character, db)).toEqual([
      { slot: 'head', kind: 'enchant', id: BOGUS_ENCHANT },
      { slot: 'trinket1', kind: 'item', id: BOGUS_ITEM },
    ]);

    const req = buildRaidSimRequest(character, presets, db, { iterations: 10, seed: 1 });
    const items = req.raid!.parties[0]!.players[0]!.equipment!.items;
    // ItemSlot order: head 0, trinket 1 is 12.
    expect(items[12]).toMatchObject({ id: 0, enchant: 0 });
    expect(items[0]).toMatchObject({ id: head.itemId, enchant: 0 });
    expect(items.some((i) => i.id === BOGUS_ITEM || i.enchant === BOGUS_ENCHANT)).toBe(false);
  });
});
