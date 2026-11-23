import { APLStats } from '@fsim/proto/api';
import { LogLevel } from '@fsim/proto/common';
import { describe, expect, it } from 'vitest';
import { actionNameSources, type ActionNameSources } from './action-names';
import { nameList, rotationCheck, rotationMessages } from './rotation-check';
import { buildSpellNames, loadSpellNames } from './spell-names';
import { fixtureDb } from './test-db';

// The sentences are the engine's own, returned by `computeStats` for this app's characters at the lock commit.
// Names come from a fixed table here, so the tests say what the sorting does and not what a spell is called
// this month; the last test names the same ids from the real game data.
const SPELLS: Record<number, string> = {
  27801: 'Holy Nova',
  1293527: 'Summon Hawk',
  1329286: 'Boot Knife',
  14079: 'Improved Ambush',
  14278: 'Ghostly Strike',
  13750: 'Adrenaline Rush',
  22959: 'Fire Vulnerability',
  9907: 'Faerie Fire',
  20572: 'Blood Fury',
  10060: 'Power Infusion',
};
const ITEMS: Record<number, string> = {
  13965: "Blackhand's Breadth",
  13444: 'Major Mana Potion',
  9449: 'Manual Crowd Pummeler',
};
const src: ActionNameSources = {
  spell: (id) => (SPELLS[id] ? { name: SPELLS[id], rank: 0, icon: '' } : undefined),
  item: (id) => ITEMS[id],
};

const RANGE =
  '{SpellID: 27801} reaches 10 yd and the character starts 20 yd from the target; nothing in the rotation moves it closer, so it is never cast.';
const AND = "A condition branch in this 'And' check could not be resolved and was dropped.";
const ALWAYS_TRUE =
  "Condition could not be resolved and will be treated as always true. Add an 'Aura Known' check if this action should be skipped when the aura is absent.";
const DO_AT = "'Do At' needs a time, ignoring this Prepull Action";
const MAX_DOTS = 'Encounter only has 1 targets. Using that for Max Dots instead of 3';
const NO_UNIT = 'No unit found matching reference: type:Target index:1';

/** Everything a check shows, as one text: what a raw id or a unit label would leak into. */
const shown = (c: ReturnType<typeof rotationCheck>) =>
  [...c.neverCast, ...c.missing, ...c.effects, ...c.setup, ...c.autocast, ...c.other.map((o) => o.text)].join(
    '\n',
  );

describe('rotationCheck', () => {
  it('sorts the engine’s sentences into kinds and names every id', () => {
    const check = rotationCheck(
      [
        'Testhunter (#1) does not know spell {SpellID: 1293527}',
        ' (#1) does not know talent {SpellID: 14079} (Rank 1)',
        'No aura found on  (#1) for: {SpellID: 13750}',
        'No aura found on Target 1 for: {SpellID: 22959}',
        RANGE,
        'Kargath (#1) picks no potion for {OtherID: 26}',
        'No swap set configured in Settings.',
        'Autocast Other Cooldowns will cast the following spells: {SpellID: 20572}, {ItemID: 13965}, {ItemID: 13444}',
        AND,
        ALWAYS_TRUE,
        DO_AT,
        MAX_DOTS,
        NO_UNIT,
      ],
      src,
    );
    expect(check).toEqual({
      neverCast: [
        'Holy Nova reaches 10 yd and the character starts 20 yd from the target; nothing in the rotation moves it closer, so it is never cast.',
      ],
      missing: ['Summon Hawk', 'Improved Ambush'],
      effects: ['Adrenaline Rush', 'Fire Vulnerability on the target'],
      setup: [
        'The rotation drinks an offensive potion, and none is chosen in the consumables.',
        'The rotation swaps to a second set of gear, and this character has none.',
      ],
      autocast: ['Blood Fury', "Blackhand's Breadth", 'Major Mana Potion'],
      other: [AND, ALWAYS_TRUE, DO_AT, MAX_DOTS, NO_UNIT].map((text) => ({ text, count: 1 })),
      total: 13,
    });
    expect(shown(check)).not.toMatch(/\{|\(#\d+\)/);
  });

  it('lists what the character does not have once, however many steps ask for it', () => {
    const check = rotationCheck(
      [
        ' (#1) does not know spell {SpellID: 20572}',
        ' (#1) does not know spell {SpellID: 20572}',
        ' (#1) does not know spell {ItemID: 9449}',
        // A talent and the spell it teaches share an id and a name.
        ' (#1) does not know talent {SpellID: 14278} (Rank 1)',
        ' (#1) does not know spell {SpellID: 14278}',
        ' (#1) does not know spell {SpellID: 20572}',
      ],
      src,
    );
    // Spells and talents before items, each in the order the rotation first asks for it.
    expect(check.missing).toEqual(['Blood Fury', 'Ghostly Strike', 'Manual Crowd Pummeler']);
    expect(check.total).toBe(6);
  });

  it('says which rank is missing only when the character holds a lower one', () => {
    const ranks = (list: number[]) =>
      rotationCheck(
        list.map((r) => ` (#1) does not know talent {SpellID: 1329286} (Rank ${r})`),
        src,
      ).missing;
    // The rotation asks for ranks 5 down to 1. Rank 1 missing: the talent is not taken at all.
    expect(ranks([5, 4, 3, 2, 1])).toEqual(['Boot Knife']);
    expect(ranks([5, 4])).toEqual(['Boot Knife (rank 4)']);
    expect(rotationCheck([' (#1) does not know talent {SpellID: 1329286}'], src).missing).toEqual([
      'Boot Knife',
    ]);
  });

  it('tells a pet’s or a target’s spell from the character’s own', () => {
    const check = rotationCheck(
      [
        'Kargath (#1) - Wolf does not know spell {SpellID: 20572}',
        'Target 2 does not know spell {SpellID: 27801}',
        'Kargath (#1) does not know spell {SpellID: 20572}',
      ],
      src,
    );
    expect(check.missing).toEqual(['Blood Fury (Wolf)', 'Holy Nova (target 2)', 'Blood Fury']);
  });

  it('names an effect by where it is missing, and keeps a real tag', () => {
    const check = rotationCheck(
      [
        'No aura found on  (#1) for: {SpellID: 13750}',
        'No aura found on Kargath (#1) for: {SpellID: 13750}',
        'No aura found on Target 1 for: {SpellID: 9907, Tag: -1}',
        'No aura found on Target 3 for: {SpellID: 22959}',
        'Could not find an aura for {SpellID: 22959} on Target(s)',
        'Could not find a DoT for {SpellID: 27801} on Target(s)',
      ],
      src,
    );
    expect(check.effects).toEqual([
      'Adrenaline Rush',
      'Faerie Fire (external) on the target',
      'Fire Vulnerability on target 3',
      'Fire Vulnerability on the target',
      'Holy Nova on the target',
    ]);
  });

  it('does not repeat a spell the character lacks as an effect it never has', () => {
    const check = rotationCheck(
      [
        ' (#1) does not know spell {SpellID: 13750}',
        'No aura found on  (#1) for: {SpellID: 13750}',
        'No aura found on  (#1) for: {SpellID: 20572}',
      ],
      src,
    );
    expect(check.missing).toEqual(['Adrenaline Rush']);
    expect(check.effects).toEqual(['Blood Fury']);
  });

  it('leaves out what an untagged id says in a run’s metrics', () => {
    // actionName reads Power Infusion without a tag as "Power Infusion (self)": right for a run, noise here.
    expect(rotationCheck([' (#1) does not know spell {SpellID: 10060}'], src).missing).toEqual([
      'Power Infusion',
    ]);
  });

  it('says each missing setup once, in this app’s words', () => {
    const check = rotationCheck(
      [
        ' (#1) picks no potion for {OtherID: 26}',
        ' (#1) picks no potion for {OtherID: 26}',
        ' (#1) picks no potion for {OtherID: 25}',
        ' (#1) picks no potion for {OtherID: 24}',
        'No swap set configured in Settings.',
        'No swap set configured in Settings.',
        'No pet to attack with.',
      ],
      src,
    );
    expect(check.setup).toEqual([
      'The rotation drinks an offensive potion, and none is chosen in the consumables.',
      'The rotation drinks a defensive potion, and none is chosen in the consumables.',
      'The rotation drinks a resource potion, and none is chosen in the consumables.',
      'The rotation swaps to a second set of gear, and this character has none.',
      'The rotation sends a pet to attack, and this character has no pet.',
    ]);
  });

  it('merges the cooldowns every automatic step casts', () => {
    const check = rotationCheck(
      [
        'Autocast Other Cooldowns will cast the following spells: {SpellID: 20572}, {ItemID: 13444}',
        'CastAllBuffCooldownsFor(Strength, AttackPower) will cast the following spells: {SpellID: 20572}, {SpellID: 10060, Tag: -1}',
      ],
      src,
    );
    expect(check.autocast).toEqual(['Blood Fury', 'Major Mana Potion', 'Power Infusion (raid)']);
    expect(check.other).toEqual([]);
  });

  it('keeps a sentence it does not know, with its ids named and the unit label gone', () => {
    const check = rotationCheck(
      [
        AND,
        'Some new upstream sentence about {SpellID: 27801} and {ItemID: 13444}.',
        AND,
        ' (#1) does not use Mana',
        'Kargath (#1) does not use Rage',
        'Spell {SpellID: 20572} does not have an associated DoT',
        'Autocast Other Cooldowns will not cast any spells! There are either no major cooldowns configured for this character, or all of them are manually cast in the APL or never go on their own.',
        AND,
      ],
      src,
    );
    expect(check.other).toEqual([
      { text: AND, count: 3 },
      { text: 'Some new upstream sentence about Holy Nova and Major Mana Potion.', count: 1 },
      { text: 'This character does not use Mana', count: 1 },
      { text: 'Kargath does not use Rage', count: 1 },
      { text: 'Spell Blood Fury does not have an associated DoT', count: 1 },
      {
        text: 'Autocast Other Cooldowns will not cast any spells! There are either no major cooldowns configured for this character, or all of them are manually cast in the APL or never go on their own.',
        count: 1,
      },
    ]);
    // Nothing is dropped: every note is in a list.
    expect(check.other.reduce((n, o) => n + o.count, 0)).toBe(check.total);
  });

  it('counts a cast that failed before the pull as never cast', () => {
    const check = rotationCheck(['{SpellID: 27801} failed to cast: not enough mana'], src);
    expect(check.neverCast).toEqual(['Holy Nova failed to cast: not enough mana']);
  });

  it('never shows a raw id, even one the data does not know', () => {
    const check = rotationCheck(
      [
        ' (#1) does not know spell {SpellID: 999001}',
        'No aura found on Target 1 for: {ItemID: 999002, Tag: 3}',
        'Autocast Other Cooldowns will cast the following spells: {OtherID: 99}',
        'Something about {SpellID: 999003, Tag: -1}',
        // A step that names no spell: the engine prints an empty id.
        ' (#1) does not know spell {}',
        'Spell {, Tag: 2} does not have an associated DoT',
      ],
      src,
    );
    expect(check.missing).toEqual(['Spell 999001', '(no spell set)']);
    expect(check.effects).toEqual(['Item 999002 on the target']);
    expect(check.autocast).toEqual(['Other action 99']);
    expect(check.other).toEqual([
      { text: 'Something about Spell 999003 (external)', count: 1 },
      { text: 'Spell (no spell set) does not have an associated DoT', count: 1 },
    ]);
    expect(shown(check)).not.toContain('{');
  });

  it('has nothing to say about a rotation the engine has no notes on', () => {
    expect(rotationCheck([], src)).toEqual({
      neverCast: [],
      missing: [],
      effects: [],
      setup: [],
      autocast: [],
      other: [],
      total: 0,
    });
  });

  it('names the example ids from the real game data', async () => {
    const db = fixtureDb();
    const real = actionNameSources(db, buildSpellNames(db.raw.spellIcons, await loadSpellNames()));
    const check = rotationCheck(
      [
        RANGE,
        ' (#1) does not know spell {SpellID: 20572}',
        'No aura found on  (#1) for: {SpellID: 13750}',
        'Autocast Other Cooldowns will cast the following spells: {ItemID: 13965}, {ItemID: 13444}',
      ],
      real,
    );
    expect(check.neverCast[0]).toMatch(/^Holy Nova reaches 10 yd /);
    expect(check.missing).toEqual(['Blood Fury']);
    expect(check.effects).toEqual(['Adrenaline Rush']);
    expect(check.autocast).toEqual(["Blackhand's Breadth", 'Major Mana Potion']);
  });
});

describe('rotationMessages', () => {
  const note = (validation: string) => ({ logLevel: LogLevel.Warning, validation });

  it('reads every note of the rotation’s stats, in the rotation’s order', () => {
    const stats = APLStats.create({
      prepullActions: [{ validations: [note('prepull')] }, { validations: [] }],
      priorityList: [
        { validations: [note('first'), note('first again')] },
        { validations: [note('second')] },
      ],
      groups: [{ actions: [{ validations: [note('group')] }] }],
      uuidValidations: [{ uuid: { value: 'a' }, validations: [note('value')] }],
    });
    expect(rotationMessages(stats)).toEqual(['prepull', 'first', 'first again', 'second', 'group', 'value']);
  });

  it('has none without rotation stats', () => {
    expect(rotationMessages(undefined)).toEqual([]);
    expect(rotationMessages(APLStats.create())).toEqual([]);
  });
});

describe('nameList', () => {
  it('reads as a phrase', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Death Wish'])).toBe('Death Wish');
    expect(nameList(['Death Wish', 'Bloodrage'])).toBe('Death Wish and Bloodrage');
    expect(nameList(['Sweeping Strikes', 'Death Wish', 'Bloodrage'])).toBe(
      'Sweeping Strikes, Death Wish and Bloodrage',
    );
  });

  it('counts the names past the limit, unless there is only one', () => {
    const names = Array.from({ length: 11 }, (_, i) => `Spell ${i + 1}`);
    expect(nameList(['Sweeping Strikes', 'Death Wish', ...names.slice(0, 9)], 2)).toBe(
      'Sweeping Strikes, Death Wish and 9 more',
    );
    expect(nameList(['A', 'B', 'C'], 2)).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D'], 2)).toBe('A, B and 2 more');
    expect(nameList(['A', 'B'], 2)).toBe('A and B');
  });
});
