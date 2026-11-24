import { describe, expect, it } from 'vitest';
import type { Character } from '@fsim/contracts';
import { characterFromPresets, fillFromPreset, hunterPetTypes, loadSpecPresets } from '@fsim/gamedata';
import { simcImporter } from '@fsim/importers';
import { withPetPick } from './pet-note';

// The importer's real note, so a change of its wording shows up here.
const ctx = {
  dataBuild: 'test',
  hasItem: () => true,
  hasEnchant: () => true,
  hunterPetTypes: hunterPetTypes(),
};
const imported = (family: string) => simcImporter.parse(`hunter="X"\nlevel=60\npet_family=${family}`, ctx);
const petNote = (d: readonly { field?: string; message: string }[]) =>
  d.find((x) => x.field === 'pet_family')?.message;

describe('withPetPick', () => {
  it('names the pet that is simmed for a family the engine has no pet of', async () => {
    const presets = await loadSpecPresets('hunter');
    const r = imported('sporebat');
    // Beast Mastery talents: the options come from upstream's BM build, which has a Raptor.
    const bm: Character = { ...r.character!, talents: characterFromPresets(presets, 'bm').talents };
    expect(petNote(withPetPick(r.diagnostics, fillFromPreset(bm, presets), presets))).toBe(
      'Pet family "sporebat" is not one the engine sims. Simming the pet of upstream’s BM preset build ' +
        'instead: Raptor. Pick another on the Workbench’s Options tab.',
    );
    // Survival talents: upstream's SV build plays without a pet.
    const sv: Character = { ...r.character!, talents: characterFromPresets(presets, 'sv').talents };
    expect(petNote(withPetPick(r.diagnostics, fillFromPreset(sv, presets), presets))).toBe(
      'Pet family "sporebat" is not one the engine sims. Upstream’s SV preset build plays without a pet, ' +
        'so none is simmed. Pick another on the Workbench’s Options tab.',
    );
    // No talents in the export: it gets the talents of upstream's default hunter, and with them that build.
    expect(petNote(withPetPick(r.diagnostics, fillFromPreset(r.character!, presets), presets))).toMatch(
      /^Pet family "sporebat" is not one the engine sims\. Upstream’s SV Weave preset build plays without a pet/,
    );
  });

  it('leaves every other note, and an import whose pet was read, as they are', async () => {
    const presets = await loadSpecPresets('hunter');
    const cat = imported('cat');
    expect(petNote(cat.diagnostics)).toBeUndefined();
    const filled = fillFromPreset(cat.character!, presets);
    expect(withPetPick(cat.diagnostics, filled, presets)).toEqual(cat.diagnostics);

    const other = imported('sporebat');
    const out = withPetPick(other.diagnostics, fillFromPreset(other.character!, presets), presets);
    expect(out.filter((d) => d.field !== 'pet_family')).toEqual(
      other.diagnostics.filter((d) => d.field !== 'pet_family'),
    );
    // Presets of another spec (still loading): nothing is rewritten.
    const mage = await loadSpecPresets('mage');
    expect(withPetPick(other.diagnostics, filled, mage)).toEqual(other.diagnostics);
  });
});
