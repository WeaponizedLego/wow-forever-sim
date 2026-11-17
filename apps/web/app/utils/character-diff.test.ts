import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '@fsim/contracts';
import { changeSummary, diffCharacters, type DiffNames } from './character-diff';

const base = CharacterSchema.parse({
  class: 'shaman',
  spec: 'elemental-shaman',
  race: 'orc',
  gear: {
    head: { itemId: 10504 },
    neck: { itemId: 12103 },
    mainHand: { itemId: 12784, enchantId: 1900 },
  },
  talents: '25003105-5052032501-05',
  rotation: { kind: 'preset', presetId: 'default' },
});

const names: DiffNames = {
  slot: (s) => ({ head: 'Head', neck: 'Neck', mainHand: 'Main hand' })[s as string] ?? s,
  item: (g) => `Item ${g.itemId}`,
  enchant: (g) => (g?.enchantId ? `Enchant ${g.enchantId}` : null),
  buffs: (b) => b.toUpperCase(),
  rotation: (c) => (c.rotation.kind === 'preset' ? c.rotation.presetId : 'custom SIML'),
};

const edit = (mutate: (c: Character) => void) => {
  const c = structuredClone(base);
  mutate(c);
  return CharacterSchema.parse(c);
};

describe('diffCharacters', () => {
  it('finds nothing between a character and its copy, whatever the key order', () => {
    const shuffled = JSON.parse(JSON.stringify({ ...base, encounter: { ...base.encounter } })) as Character;
    shuffled.specOptions = Object.fromEntries(Object.entries(base.specOptions).reverse());
    expect(diffCharacters(base, structuredClone(base), names)).toEqual([]);
    expect(diffCharacters(base, shuffled, names)).toEqual([]);
  });

  it('reports a swapped item as − old + new, labelled with its slot', () => {
    const b = edit((c) => (c.gear.head = { itemId: 99 }));
    expect(diffCharacters(base, b, names)).toEqual([
      {
        key: 'gear:head',
        kind: 'gear',
        slot: 'head',
        rows: [
          { op: '-', label: 'Item 10504', detail: 'head' },
          { op: '+', label: 'Item 99' },
        ],
      },
    ]);
  });

  it('reports an enchant-only change as enchants, and an emptied slot as empty', () => {
    const b = edit((c) => {
      c.gear.mainHand = { itemId: 12784 };
      delete c.gear.neck;
    });
    const groups = diffCharacters(base, b, names);
    expect(groups.map((g) => g.key)).toEqual(['gear:neck', 'gear:mainHand']);
    expect(groups[0]!.rows.map((r) => r.label)).toEqual(['Item 12103', 'Neck: empty']);
    expect(groups[1]!.rows.map((r) => r.label)).toEqual(['Main hand: Enchant 1900', 'Main hand: no enchant']);
  });

  it('reports talents, buffs, fight, rotation and other settings in that order', () => {
    const b = edit((c) => {
      c.talents = '1-2-3';
      c.buffs = 'solo';
      c.encounter.durationSec = 120;
      c.encounter.targetCount = 3;
      c.rotation = { kind: 'siml', source: 'cast x' };
      c.race = 'troll';
    });
    const groups = diffCharacters(base, b, names);
    expect(groups.map((g) => g.key)).toEqual([
      'talents',
      'buffs',
      'fight:Duration',
      'fight:Targets',
      'rotation',
      'other',
    ]);
    expect(groups[1]!.rows.map((r) => r.label)).toEqual(['Buffs: FULL-RAID', 'Buffs: SOLO']);
    expect(groups[2]!.rows.map((r) => r.label)).toEqual(['Duration: 180 s ± 5', 'Duration: 120 s ± 5']);
    expect(groups[4]!.rows.map((r) => r.label)).toEqual(['Rotation: default', 'Rotation: custom SIML']);
  });

  it('ignores display-only fields (name, realm)', () => {
    const b = edit((c) => {
      c.name = 'Other';
      c.realm = 'Somewhere';
    });
    expect(diffCharacters(base, b, names)).toEqual([]);
  });

  it('still notices fields it has no row for (a newer schema), as fight settings or other settings', () => {
    const a = { ...base, encounter: { ...base.encounter, fightStyle: 'patchwerk' } } as Character;
    const b = { ...base, encounter: { ...base.encounter, fightStyle: 'movement' }, newThing: 1 } as Character;
    expect(diffCharacters(a, b, names).map((g) => g.key)).toEqual(['fight:other', 'other']);
  });
});

describe('changeSummary', () => {
  it('lists changed slots, then the other kinds once each', () => {
    const b = edit((c) => {
      c.gear.head = { itemId: 1 };
      c.gear.neck = { itemId: 2 };
      c.encounter.durationSec = 60;
      c.encounter.targetCount = 2;
      c.professions = ['Alchemy'];
    });
    expect(changeSummary(diffCharacters(base, b, names), names.slot)).toBe(
      'Head, Neck · fight · other settings',
    );
    expect(changeSummary([], names.slot)).toBe('no differences');
  });
});
