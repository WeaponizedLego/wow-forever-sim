import { readFileSync } from 'node:fs';
import { OtherAction } from '@fsim/proto/common';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  actionName,
  actionNameGaps,
  enchantProcNames,
  actionNameSources,
  distinctActionNames,
  type ActionNameSources,
  type ActionRef,
  type RunActionIds,
} from './action-names';
import { buildSpellNames, loadSpellNames } from './spell-names';
import { fixtureDb } from './test-db';

// Every action id that each spec's preset builds and a Wowhead-imported Hunter report in the locked engine, and
// the gaps in their names at that engine (written by packages/engine/src/action-names.test.ts with
// UPDATE_ACTION_IDS=1, which engine sync runs on every sync).
const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/engine/action-ids.json', import.meta.url), 'utf8'),
) as { gaps: string[]; runs: Record<string, RunActionIds> };

const spell = (id: number, tag = 0): ActionRef => ({ kind: 'spell', id, tag });
const item = (id: number, tag = 0): ActionRef => ({ kind: 'item', id, tag });
const melee = (tag = 0): ActionRef => ({ kind: 'other', id: OtherAction.OtherActionAttack, tag });

let src: ActionNameSources;
beforeAll(async () => {
  const db = fixtureDb();
  src = actionNameSources(db, buildSpellNames(db.raw.spellIcons, await loadSpellNames()));
});

describe('action names', () => {
  it('names auto attacks by hand, and extra attacks by the spell that granted them', () => {
    expect(actionName(melee(), src)).toBe('Melee');
    expect(actionName(melee(14), src)).toBe('Melee (main hand)');
    expect(actionName(melee(15), src)).toBe('Melee (off hand)');
    expect(actionName(melee(15601), src)).toBe('Melee (Hand of Justice)');
    expect(actionName(melee(18797), src)).toBe('Melee (Flurry Axe)');
    expect(actionName(melee(1290261), src)).toBe('Melee (Weaponmaster)');
    expect(actionName(melee(99999), src)).toBe('Melee (boss)');
  });

  it('names strikes and procs by the hand that made them', () => {
    expect(actionName(spell(1680, 14), src)).toBe('Whirlwind (main hand)');
    expect(actionName(spell(1680, 15), src)).toBe('Whirlwind (off hand)');
    // An enchant's proc aura names the enchant too (Crusader's is Holy Strength, 20007, in db.bin).
    expect(actionName(spell(20007, 14), src)).toBe('Holy Strength (Crusader, main hand)');
    expect(actionName(spell(20007, 15), src)).toBe('Holy Strength (Crusader, off hand)');
    // A hand-tagged strike that is no enchant's aura stays just the hand.
    expect(actionName(spell(1680, 14), src)).toBe('Whirlwind (main hand)');
  });

  it('credits a proc to an enchant only when exactly one enchant grants that aura', () => {
    const procs = enchantProcNames([
      { name: 'Enchant Weapon - Crusader', enchantEffects: [{ buffId: 20007 }] },
      { name: 'Enchant 2H Weapon - Agility', enchantEffects: [{ buffId: 0 }] },
      { name: 'Enchant Weapon - Shared A', enchantEffects: [{ buffId: 555 }] },
      { name: 'Enchant Weapon - Shared B', enchantEffects: [{ buffId: 555 }] },
    ]);
    expect(procs.get(20007)).toBe('Crusader');
    expect(procs.has(0)).toBe(false);
    expect(procs.has(555)).toBe(false);
  });

  it("applies upstream's per-spell tags", () => {
    expect(actionName(spell(25286), src)).toBe('Heroic Strike');
    expect(actionName(spell(25286, 1), src)).toBe('Heroic Strike (queued)');
    expect(actionName(spell(14266, 1), src)).toBe('Raptor Strike (queued)');
    expect(actionName(spell(12723, 1), src)).toBe('Sweeping Strikes (normalized)');
    expect(actionName(spell(1290261, 3), src)).toBe('Weaponmaster (sword)');
    expect(actionName(spell(10610), src)).toBe('Windfury Totem (attack)');
    expect(actionName(spell(10157, -1), src)).toMatch(/^Arcane Intellect \(external\)$/);
  });

  it('names consumables from the database, never from a spell with the same id', () => {
    expect(actionName(item(10646), src)).toBe('Goblin Sapper Charge');
    expect(actionName(item(10646, 1), src)).toBe('Goblin Sapper Charge (self)');
    expect(actionName(item(18588), src)).toBe('Ez-Thro Dynamite II');
    expect(actionName(item(13442), src)).toBe('Mighty Rage Potion'); // spell 13442 is Firebolt
    expect(actionName(item(13965), src)).toBe("Blackhand's Breadth");
  });

  it('falls back to kind and id, never a bare tag', () => {
    expect(actionName(item(1), src)).toBe('Item 1');
    expect(actionName(spell(1, 7), src)).toBe('Spell 1');
    expect(actionName({ kind: 'other', id: 999, tag: 0 }, src)).toBe('Other action 999');
  });

  it('tells same-named rows apart by rank, then by count, and per owner', () => {
    const fake: ActionNameSources = {
      spell: (id) => ({ name: 'Bolt', rank: id === 1 ? 1 : id === 2 ? 2 : 0, icon: '' }),
      item: () => undefined,
    };
    expect(distinctActionNames([spell(1), spell(2)], fake)).toEqual(['Bolt (rank 1)', 'Bolt (rank 2)']);
    expect(distinctActionNames([spell(3), spell(3, 7)], fake)).toEqual(['Bolt', 'Bolt (2)']);
    expect(distinctActionNames([spell(3), spell(3, 7)], fake, [null, 'Cat'])).toEqual(['Bolt', 'Bolt']);
  });

  it('names the ids the engine builds outside its spell table', () => {
    expect(actionName(spell(22482), src)).toBe('Blade Flurry');
    expect(actionName(spell(408501), src)).toBe('Maelstrom Ready!');
    expect(actionName(item(6265), src)).toBe('Soul Shards');
  });

  it("tells a spell's copies and parts apart the way upstream does", () => {
    expect(actionName(spell(15208, 6), src)).toBe('Lightning Bolt (overload)');
    expect(actionName(spell(15208, 5), src)).toBe('Lightning Bolt (5 Maelstrom Weapon)');
    expect(actionName(spell(10605, 7), src)).toBe('Chain Lightning (echo)');
    expect(actionName(spell(1237313, 1), src)).toBe('Frostfire Bolt (DoT)');
    expect(actionName(spell(1325758, 4), src)).toBe('Death Mark (4 combo points)');
    // Same name, different spells: the id says which part it is.
    expect(actionName(spell(11129), src)).toBe('Combustion');
    expect(actionName(spell(28682), src)).toBe('Combustion (crit chance)');
    expect(actionName(spell(414647), src)).toBe('Lacerate (hit)');
    expect(actionName(spell(1329326), src)).toBe('Ghostly Strike (triggered)');
  });

  it('puts a rank inside the brackets a name already has', () => {
    const bolts = [spell(10392), spell(15208), spell(10392, 6), spell(15208, 6)];
    expect(distinctActionNames(bolts, src)).toEqual([
      'Lightning Bolt (rank 8)',
      'Lightning Bolt (rank 10)',
      'Lightning Bolt (overload, rank 8)',
      'Lightning Bolt (overload, rank 10)',
    ]);
  });

  it('lists what it cannot name or tell apart as gaps', () => {
    const run = { abilities: [], auras: [], all: ['spell:1', 'item:1', 'spell:25286'] };
    expect(actionNameGaps(run, src)).toEqual(['item:1 has no name', 'spell:1 has no name']);
    // Two rows with one name and nothing to tell them apart but a count; a pet's row never clashes with its owner's.
    const twice = {
      abilities: [
        ['spell:25286#9', null],
        ['spell:25286#8', null],
        ['spell:25286#9', 'Wolf'],
      ] as [string, string | null][],
      auras: ['spell:25286#9', 'spell:25286#8'],
      all: [],
    };
    expect(actionNameGaps(twice, src)).toEqual([
      'aura spell:25286#8 shares the name "Heroic Strike"',
      'aura spell:25286#9 shares the name "Heroic Strike"',
      'row spell:25286#8 shares the name "Heroic Strike"',
      'row spell:25286#9 shares the name "Heroic Strike"',
    ]);
  });

  // The fixture's own `gaps` are what engine sync found at its engine (it opens an issue for them and does not
  // stop). Offline, the names must not do worse than that: a gap here that the fixture does not list is a
  // regression in this package.
  it(`has no gap in ${Object.keys(fixture.runs).length} real runs beyond those the fixture lists`, () => {
    expect(Object.keys(fixture.runs).length).toBeGreaterThan(30);
    const gaps = Object.entries(fixture.runs).flatMap(([run, ids]) =>
      actionNameGaps(ids, src).map((gap) => `${run}: ${gap}`),
    );
    expect(gaps.filter((g) => !fixture.gaps.includes(g))).toEqual([]);
  });
});
