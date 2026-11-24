import { readFileSync } from 'node:fs';
import { importAny } from '@fsim/importers';
import { HunterOptions_PetType } from '@fsim/proto/hunter';
import { describe, expect, it } from 'vitest';
import { characterToPlayer } from './character';
import { toImportContext } from './import-context';
import { closestSetup, loadSpecPresets } from './presets';
import { fillFromPreset } from './request';
import { fixtureDb } from './test-db';

// A hunter's pet, from the export to the engine's Player: the importer matches the family against the engine's
// pet types (`toImportContext`), the preset fills the options the export does not have, and the request carries both.
describe('SimC hunter exports: the pet reaches the engine', () => {
  const db = fixtureDb();
  const read = (file: string) =>
    importAny(
      readFileSync(new URL(`../../../fixtures/import/${file}`, import.meta.url), 'utf8'),
      toImportContext(db, '1.60.1.70888'),
    );
  const petOf = (player: ReturnType<typeof characterToPlayer>) =>
    player.spec.oneofKind === 'hunter' ? player.spec.hunter.options?.classOptions?.petType : undefined;

  it('offers the importers the engine’s pet families', () => {
    const families = toImportContext(db, 'x').hunterPetTypes;
    expect(families).toContain('Cat');
    expect(families).toContain('WindSerpent');
    expect(families).not.toContain('PetNone');
  });

  it.each([
    // Addon 12.1.5-02, a real client: the family is in the commented pet_info line. Its few talents are Beast
    // Mastery's, so without the line it would sim the BM build's Raptor.
    ['real/simc-hunter-lvl11.simc', 'Boar', HunterOptions_PetType.Boar, HunterOptions_PetType.Raptor],
    // Addon 12.1.5-04, reconstructed: a pet_family line. Its talents cannot be read, and upstream's default
    // hunter plays without a pet.
    ['simc-survival-hunter.simc', 'Cat', HunterOptions_PetType.Cat, HunterOptions_PetType.PetNone],
  ])('%s: %s, with the rest of the options from the preset', async (file, name, petType, presetPet) => {
    const r = read(file);
    expect(r.character!.specOptions).toEqual({ classOptions: { petType: name } });
    expect(r.diagnostics.filter((d) => d.field === 'pet_family')).toEqual([]);

    const presets = await loadSpecPresets('hunter');
    const filled = fillFromPreset(r.character!, presets);
    const preset = closestSetup(presets, r.character!.talents).setup.specOptions;
    expect(filled.specOptions).toEqual({
      classOptions: { ...(preset.classOptions as object), petType: name, cobraReflexes: false },
    });
    expect(petOf(characterToPlayer(filled, presets, db))).toBe(petType);
    // Without the pet line the same export sims the preset's pet.
    const without = fillFromPreset({ ...r.character!, specOptions: {} }, presets);
    expect(petOf(characterToPlayer(without, presets, db))).toBe(presetPet);
  });
});

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
