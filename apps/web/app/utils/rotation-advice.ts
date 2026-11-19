// Which rotation fits a character's talents. Rotations are upstream's ready-made priority lists, one or more per
// preset build; nothing derives one from the talents themselves. So the advice is: find the preset build closest to
// the talents (@fsim/gamedata suggestedRotation) and say whether the rotation in use is the one upstream plays with
// that build. Pure, so the Workbench, the Start screen's parse report and the tests share it.
import type { Character, Diagnostic } from '@fsim/contracts';
import {
  buildLabel,
  findRotation,
  suggestedRotation,
  type PresetBuild,
  type PresetRotation,
  type SpecPresets,
} from '@fsim/gamedata';

export interface RotationAdvice {
  /** The rotation in use; undefined for SIML or an id the spec does not have. */
  current: PresetRotation | undefined;
  /** The preset build closest to the talents, and the rotation upstream plays with it. */
  build: PresetBuild;
  suggested: PresetRotation;
  /**
   * - `fits`: the suggested rotation is in use.
   * - `other-build`: the one in use is what upstream plays with other builds, not this one: most likely a leftover.
   * - `alternative`: the one in use belongs to no build (a variant such as "Clean Weave"): a choice, not a mistake.
   */
  state: 'fits' | 'other-build' | 'alternative';
  /** The builds upstream plays the rotation in use with, by label. */
  currentBuilds: string[];
}

/** Labels of the preset builds that use a rotation ("MM", "SV"). */
export const buildsUsing = (presets: SpecPresets, rotationId: string): string[] =>
  presets.builds.filter((b) => b.setup.rotationId === rotationId).map(buildLabel);

/** Null when the spec has no build to compare with, or the presets are another spec's (still loading). */
export function rotationAdvice(character: Character, presets: SpecPresets): RotationAdvice | null {
  if (presets.specId !== character.spec) return null;
  const match = suggestedRotation(presets, character.talents);
  if (!match) return null;
  const current =
    character.rotation.kind === 'preset' ? findRotation(presets, character.rotation.presetId) : undefined;
  const currentBuilds = current ? buildsUsing(presets, current.id) : [];
  return {
    current,
    build: match.build,
    suggested: match.rotation,
    state: current?.id === match.rotation.id ? 'fits' : currentBuilds.length ? 'other-build' : 'alternative',
    currentBuilds,
  };
}

/** "Turret (Hawks): upstream plays it with its BM build, the closest to these talents." */
export function rotationPickText(character: Character, presets: SpecPresets): string | null {
  const advice = rotationAdvice(character, presets);
  const current =
    advice?.current ??
    (character.rotation.kind === 'preset' ? findRotation(presets, character.rotation.presetId) : undefined);
  if (!current) return null;
  return advice?.state === 'fits'
    ? `${current.name}: upstream plays it with its ${buildLabel(advice.build)} build, the closest to these talents.`
    : `${current.name}, upstream’s default for the spec.`;
}

/**
 * Import notes with the "rotation not in the export" line naming the rotation that was picked and why.
 * `filled` is the character after `fillFromPreset`.
 */
export function withRotationPick(
  diagnostics: readonly Diagnostic[],
  filled: Character,
  presets: SpecPresets,
): Diagnostic[] {
  const text = rotationPickText(filled, presets);
  return diagnostics.map((d) =>
    text && d.code === 'DEFAULT-05' && d.field === 'rotation'
      ? {
          ...d,
          message: `Rotation not in the export. Using ${text} Change it on the Workbench’s Rotation tab.`,
        }
      : d,
  );
}
