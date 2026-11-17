import { readFileSync } from 'node:fs';
import { OtherAction } from '@fsim/proto/common';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  actionName,
  actionNameSources,
  distinctActionNames,
  shownAuraKeys,
  type ActionNameSources,
  type ActionRef,
} from './action-names';
import { buildSpellNames, loadSpellNames } from './spell-names';
import { fixtureDb } from './test-db';

// Every action id the Warrior presets and a Wowhead-imported Hunter report in the locked engine (written by
// packages/engine/src/action-names.test.ts with UPDATE_ACTION_IDS=1).
const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/engine/action-ids.json', import.meta.url), 'utf8'),
) as {
  runs: Record<string, { abilities: [string, string | null][]; auras: string[]; all: string[] }>;
};

const parse = (k: string): ActionRef => {
  const m = /^(spell|item|other):(-?\d+)(?:#(-?\d+))?$/.exec(k)!;
  return { kind: m[1] as ActionRef['kind'], id: Number(m[2]), tag: m[3] ? Number(m[3]) : 0 };
};
const spell = (id: number, tag = 0): ActionRef => ({ kind: 'spell', id, tag });
const item = (id: number, tag = 0): ActionRef => ({ kind: 'item', id, tag });
const melee = (tag = 0): ActionRef => ({ kind: 'other', id: OtherAction.OtherActionAttack, tag });

/** A label that leaks a raw id or tag: "tag 14", "Item 10646", "Spell 12345", "Other action 20". */
const RAW = /tag |\b(Item|Spell|Other action) \d+/;

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
    expect(actionName(spell(20007, 14), src)).toBe('Holy Strength (main hand)');
    expect(actionName(spell(20007, 15), src)).toBe('Holy Strength (off hand)');
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

  for (const [run, ids] of Object.entries(fixture.runs)) {
    it(`names every action of the ${run} run`, () => {
      const names = ids.all.map((k) => actionName(parse(k), src));
      expect(names.filter((n) => RAW.test(n))).toEqual([]);

      const abilities = distinctActionNames(
        ids.abilities.map(([k]) => parse(k)),
        src,
        ids.abilities.map(([, o]) => o),
      );
      const shown = shownAuraKeys(ids.auras);
      const auras = distinctActionNames(ids.auras.filter((k) => shown.has(k)).map(parse), src);
      for (const list of [abilities, auras]) {
        expect(list.filter((n) => RAW.test(n))).toEqual([]);
        // Same-named rows only ever come from the count fallback, which these runs should not need.
        expect(list.filter((n) => / \(\d+\)$/.test(n))).toEqual([]);
      }
      expect(new Set(abilities.map((n, i) => `${ids.abilities[i]![1]}|${n}`)).size).toBe(abilities.length);
      expect(new Set(auras).size).toBe(auras.length);
    });
  }
});
