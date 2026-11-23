// The import note for a hunter pet family the engine has no pet of, finished once the preset has filled the
// character's options: it names the pet that is simmed instead. The importer cannot name it, since it does not
// know the presets. Pure, so the Workbench, the Start screen's parse report and the tests share it.
import type { Character, Diagnostic } from '@fsim/contracts';
import {
  buildLabel,
  closestSetup,
  specOptionFields,
  specOptionText,
  specOptionValue,
  type SpecPresets,
} from '@fsim/gamedata';

/** The importer's own ending of the note, which this replaces. */
const UNNAMED = / The spec preset’s pet is used instead\.$/;

/**
 * Import notes with the "pet family is not simmed" line naming the pet that is: the one of the preset build the
 * options were filled from, or none where that build plays without a pet. `filled` is the character after
 * `fillFromPreset`.
 */
export function withPetPick(
  diagnostics: readonly Diagnostic[],
  filled: Character,
  presets: SpecPresets,
): Diagnostic[] {
  const pet = specOptionFields(filled.spec).find((f) => f.key === 'classOptions.petType');
  if (!pet || pet.kind !== 'enum' || presets.specId !== filled.spec) return [...diagnostics];
  const value = specOptionValue(filled.specOptions, pet);
  const { build } = closestSetup(presets, filled.talents);
  const preset = build ? `upstream’s ${buildLabel(build)} preset build` : 'the spec preset';
  const used =
    value === pet.choices[0]!.value
      ? `${preset.charAt(0).toUpperCase()}${preset.slice(1)} plays without a pet, so none is simmed.`
      : `Simming the pet of ${preset} instead: ${specOptionText(pet, value)}.`;
  return diagnostics.map((d) =>
    d.code === 'DEFAULT-05' && d.field === 'pet_family'
      ? {
          ...d,
          message: `${d.message.replace(UNNAMED, '')} ${used} Pick another on the Workbench’s Options tab.`,
        }
      : d,
  );
}
