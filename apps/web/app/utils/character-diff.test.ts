import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '@fsim/contracts';
import { MAX_TALENT_ROWS, changeSummary, diffCharacters, type DiffNames } from './character-diff';

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
  // The rotation's own "Shoot spot" is 12.
  rotationValue: (c, name) => String((c.rotation.kind === 'preset' && c.rotation.values?.[name]) || 12),
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
      c.encounter.style = 'custom';
      c.encounter.durationSec = 120;
      c.encounter.targetCount = 3;
      c.rotation = { kind: 'siml', source: 'cast x' };
      c.race = 'troll';
    });
    const groups = diffCharacters(base, b, names);
    expect(groups.map((g) => g.key)).toEqual([
      'talents',
      'buffs',
      'fight:Fight',
      'fight:Duration',
      'fight:Targets',
      'rotation',
      'other',
    ]);
    expect(groups[1]!.rows.map((r) => r.label)).toEqual(['Buffs: FULL-RAID', 'Buffs: SOLO']);
    expect(groups[3]!.rows.map((r) => r.label)).toEqual(['Duration: 180 s ± 5', 'Duration: 120 s ± 5']);
    expect(groups[5]!.rows.map((r) => r.label)).toEqual(['Rotation: default', 'Rotation: custom SIML']);
  });

  it('lists a rotation’s changed on/off settings one by one', () => {
    const turret = (switches?: Record<string, boolean>) =>
      edit((c) => (c.rotation = { kind: 'preset', presetId: 'turret', ...(switches && { switches }) }));
    const rows = (a: Character, b: Character) => diffCharacters(a, b, names).flatMap((g) => g.rows);

    expect(rows(turret(), turret({ 'Use Summon Hawk': true, 'Use Aimed Shot': false }))).toEqual([
      { op: '+', label: 'Use Summon Hawk: on', detail: 'rotation' },
      { op: '-', label: 'Use Aimed Shot: off' },
    ]);
    // Back to the rotation's own value: the side that lists nothing has the opposite of what the other changed.
    expect(rows(turret({ 'Use Summon Hawk': true }), turret())).toEqual([
      { op: '-', label: 'Use Summon Hawk: off', detail: 'rotation' },
    ]);
    expect(rows(turret({ 'Use Summon Hawk': true }), turret({ 'Use Summon Hawk': true }))).toEqual([]);
    // A number: what it was and what it is, whichever side has the rotation's own value.
    const spot = (n?: number) =>
      edit(
        (c) =>
          (c.rotation = { kind: 'preset', presetId: 'turret', ...(n && { values: { 'Shoot spot': n } }) }),
      );
    expect(rows(spot(), spot(15))).toEqual([
      { op: '-', label: 'Shoot spot: 12', detail: 'rotation' },
      { op: '+', label: 'Shoot spot: 15' },
    ]);
    expect(rows(spot(15), spot()).map((r) => r.label)).toEqual(['Shoot spot: 15', 'Shoot spot: 12']);
    expect(rows(spot(15), spot(15))).toEqual([]);
    // Another rotation: the two names, as `names.rotation` gives them.
    expect(rows(base, turret({ 'Use Summon Hawk': true })).map((r) => r.label)).toEqual([
      'Rotation: default',
      'Rotation: turret',
    ]);
  });

  it('describes a talent change talent by talent, with the points per tree', () => {
    const warrior = CharacterSchema.parse({
      ...structuredClone(base),
      class: 'warrior',
      spec: 'dps-warrior',
      talents: '30303213002-350530005122100231-1',
    });
    const b = { ...warrior, talents: '30303213002-250530005122100231-1' };
    expect(diffCharacters(warrior, b, names)).toEqual([
      {
        key: 'talents',
        kind: 'talents',
        rows: [{ op: '-', label: 'Booming Voice 3/5 → 2/5', detail: 'Fury 33 → 32' }],
      },
    ]);

    // Points moved between trees: each tree's rows, in tree order, its first row with the tree's points.
    const c = { ...warrior, talents: '30303213002-350530005122100231-15' };
    const d = { ...warrior, talents: '30303213002-350530005122100201-1', class: 'warrior' as const };
    expect(diffCharacters(c, d, names)[0]!.rows).toEqual([
      { op: '-', label: expect.stringMatching(/ 3\/3 → 0\/3$/), detail: 'Fury 33 → 30' },
      { op: '-', label: expect.stringMatching(/ 5\/5 → 0\/5$/), detail: 'Protection 6 → 1' },
    ]);

    // Strings that spend the same points ("…-" vs "…") are no change.
    expect(diffCharacters(warrior, { ...warrior, talents: `${warrior.talents}-` }, names)).toEqual([]);
  });

  it(`lists at most ${MAX_TALENT_ROWS} talents, then how many more`, () => {
    const warrior = CharacterSchema.parse({
      ...structuredClone(base),
      class: 'warrior',
      spec: 'dps-warrior',
      talents: '',
    });
    const b = { ...warrior, talents: '30303213002-350530005122100231-1' };
    const rows = diffCharacters(warrior, b, names)[0]!.rows;
    expect(rows).toHaveLength(MAX_TALENT_ROWS + 1);
    expect(rows[0]).toEqual({ op: '+', label: 'Improved Heroic Strike 0/3 → 3/3', detail: 'Arms 0 → 17' });
    expect(rows.slice(0, -1).every((r) => r.op === '+' && /\d\/\d → \d\/\d$/.test(r.label))).toBe(true);
    expect(rows.at(-1)).toEqual({ op: '+', label: 'and 14 more talent changes' });
  });

  it('shows a change of fight style as one row', () => {
    const b = edit((c) => (c.encounter.style = 'dungeon-slice-5m'));
    const groups = diffCharacters(base, b, names);
    expect(groups.map((g) => g.key)).toEqual(['fight:Fight']);
    expect(groups[0]!.rows.map((r) => r.label)).toEqual([
      'Fight: Patchwerk 3 min',
      'Fight: Dungeon slice 5 min',
    ]);
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

  describe('spec options', () => {
    // Upstream's Survival options: no pet, and the options it leaves out are at the engine's defaults.
    const SV = { quiverBonus: 'AncientSinewWrappedLamina', ammo: 'ThoriumHeadedArrow', petUptime: 1 };
    const hunter = (classOptions: Record<string, unknown>, more: Partial<Character> = {}) =>
      CharacterSchema.parse({
        ...structuredClone(base),
        class: 'hunter',
        spec: 'hunter',
        specOptions: { classOptions },
        ...more,
      });

    it('names each option that differs, with what it was and is', () => {
      const a = hunter({ ...SV, petType: 'Raptor' });
      const b = hunter({ ...SV, petType: 'Cat', petUptime: 0.5, cobraReflexes: true });
      expect(diffCharacters(a, b, names)).toEqual([
        {
          key: 'options',
          kind: 'options',
          // Each row may wrap: what the option changed to is at the end of its label.
          rows: [
            { op: '+', label: 'Pet type: Raptor → Cat', detail: 'options', wrap: true },
            { op: '-', label: 'Pet uptime: 100% → 50%', wrap: true },
            { op: '+', label: 'Cobra reflexes: on', wrap: true },
          ],
        },
      ]);
      // Taking the pet away, or switching something off, is a − row.
      expect(diffCharacters(b, hunter(SV), names)[0]!.rows).toEqual([
        { op: '-', label: 'Pet type: Cat → None', detail: 'options', wrap: true },
        { op: '+', label: 'Pet uptime: 50% → 100%', wrap: true },
        { op: '-', label: 'Cobra reflexes: off', wrap: true },
      ]);
    });

    it('finds no difference between the same options, left out or written at their default', () => {
      const full = hunter({
        ...SV,
        petType: 'PetNone',
        cobraReflexes: false,
        petAttackSpeed: 'PetAttackSpeedNone',
      });
      expect(diffCharacters(hunter(SV), full, names)).toEqual([]);
      expect(diffCharacters(full, hunter(SV), names)).toEqual([]);
      expect(diffCharacters(hunter({}), hunter({}, { specOptions: {} }), names)).toEqual([]);
    });

    it('sits between talents and buffs, and counts once in the summary', () => {
      const a = hunter(SV);
      const b = hunter({ ...SV, petType: 'Wolf', ammo: 'Doomshot' }, { talents: '1-2-3', buffs: 'solo' });
      const groups = diffCharacters(a, b, names);
      expect(groups.map((g) => g.key)).toEqual(['talents', 'options', 'buffs']);
      expect(changeSummary(groups, names.slot)).toBe('talents · options · buffs');
    });

    it('still notices an option without a field, and other settings stay their own row', () => {
      const a = hunter(SV);
      const b = hunter({ ...SV, fromANewerEngine: 2 }, { race: 'troll' });
      expect(diffCharacters(a, b, names)).toEqual([
        {
          key: 'options',
          kind: 'options',
          rows: [{ op: '+', label: 'Other spec options', detail: 'options' }],
        },
        {
          key: 'other',
          kind: 'other',
          rows: [{ op: '+', label: 'Other settings: race, professions, consumables', detail: 'other' }],
        },
      ]);
    });

    it('does not compare the options of two specs one by one', () => {
      const shaman = edit((c) => (c.specOptions = { classOptions: { imbueMh: 'WindfuryWeapon' } }));
      expect(diffCharacters(hunter(SV), shaman, names).map((g) => g.key)).toEqual(['other']);
    });
  });
});

describe('changeSummary', () => {
  it('lists changed slots, then the other kinds once each', () => {
    const b = edit((c) => {
      c.gear.head = { itemId: 1 };
      c.gear.neck = { itemId: 2 };
      c.encounter.style = 'custom';
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
