import { readFileSync } from 'node:fs';
import { importAny } from '@fsim/importers';
import { describe, expect, it } from 'vitest';
import { toImportContext } from './import-context';
import { fixtureDb } from './test-db';

// Integration test: a real SimC export from a WoW Forever client against the real data build.
describe('real SimC export: level 42 shaman', () => {
  const input = readFileSync(
    new URL('../../../fixtures/import/real/simc-shaman-lvl42.simc', import.meta.url),
    'utf8',
  );
  const db = fixtureDb();
  const r = importAny(input, toImportContext(db, '1.60.1.70888'));
  const c = r.character!;

  it('imports every equipped slot (shirt and bags skipped)', () => {
    expect(r.format).toBe('simc');
    expect(c.class).toBe('shaman');
    expect(c.race).toBe('dwarf');
    expect(Object.keys(c.gear)).toHaveLength(16);
    expect(r.diagnostics.filter((d) => d.code === 'DATA-03')).toEqual([]);
  });

  it('reads random suffixes from bonus_id', () => {
    expect(c.gear.head).toEqual({ itemId: 7488, randomSuffix: 12725 }); // of the Boar
    expect(c.gear.neck?.randomSuffix).toBe(12751); // of the Bandit
    expect(c.gear.chest).toEqual({ itemId: 9854, enchantId: 8487, randomSuffix: 12732 });
    expect(c.gear.finger1?.randomSuffix).toBe(12723); // of the Gorilla
    expect(c.gear.wrist?.randomSuffix).toBeUndefined();
  });

  it('warns that the engine sims level 60; converts the loadout talents and picks the spec from them', () => {
    const codes = r.diagnostics.map((d) => `${d.code}:${d.severity}`);
    expect(codes).toContain('LEVEL-07:warning');
    expect(codes).toContain('SPEC-06:info');
    // The client loadout string, read with the verified shaman tree: Enhancement 25, Restoration 8.
    expect(c.talents).toBe('-0530303100212122-053');
    expect(c.spec).toBe('enhancement-shaman');
    expect(r.diagnostics.filter((d) => d.field === 'talents')).toEqual([]);
    expect(c.level).toBe(42);
  });

  it('ignores gear listed only in bag comments', () => {
    expect(c.gear.mainHand?.itemId).toBe(280604);
    expect(c.gear.ranged?.itemId).toBe(263412);
  });
});
