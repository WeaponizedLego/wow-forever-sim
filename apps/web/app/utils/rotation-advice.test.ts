import type { Character, Diagnostic } from '@fsim/contracts';
import { characterFromPresets, fillFromPreset, loadSpecPresets } from '@fsim/gamedata';
import { describe, expect, it } from 'vitest';
import { buildsUsing, rotationAdvice, switchTalentNote, withRotationPick } from './rotation-advice';

const withRotation = (c: Character, presetId: string): Character => ({
  ...c,
  rotation: { kind: 'preset', presetId },
});

describe('rotation advice', () => {
  it('says whether the rotation in use is the one upstream plays with the closest build', async () => {
    const hunter = await loadSpecPresets('hunter');
    const bm = characterFromPresets(hunter, 'bm');

    const fits = rotationAdvice(bm, hunter)!;
    expect([fits.state, fits.build.id, fits.suggested.id]).toEqual(['fits', 'bm', 'turret-hawks']);

    // The old import default: SV Weave's rotation on a Beast Mastery hunter.
    const leftover = rotationAdvice(withRotation(bm, 'melee-weave-max'), hunter)!;
    expect(leftover.state).toBe('other-build');
    expect(leftover.currentBuilds).toEqual(['SV Weave']);
    expect(leftover.suggested.name).toBe('Turret (Hawks)');

    // A variant no build uses is a choice, not a leftover.
    expect(rotationAdvice(withRotation(bm, 'turret-multi-shot'), hunter)!.state).toBe('alternative');
    expect(buildsUsing(hunter, 'turret')).toEqual(['MM', 'SV']);
  });

  it('takes a rotation with hand-changed settings as a choice, not a leftover', async () => {
    const hunter = await loadSpecPresets('hunter');
    const bm = characterFromPresets(hunter, 'bm');
    const turret = (switches?: Record<string, boolean>): Character => ({
      ...bm,
      rotation: { kind: 'preset', presetId: 'turret', ...(switches && { switches }) },
    });
    expect(rotationAdvice(turret(), hunter)!.state).toBe('other-build');
    expect(rotationAdvice(turret({ 'Use Summon Hawk': true }), hunter)!.state).toBe('alternative');
    // A stored value equal to the rotation's own is no change.
    expect(rotationAdvice(turret({ 'Use Summon Hawk': false }), hunter)!.state).toBe('other-build');
    const edited: Character = {
      ...bm,
      rotation: { kind: 'preset', presetId: 'turret-hawks', switches: { 'Use Aimed Shot': false } },
    };
    expect(rotationAdvice(edited, hunter)!.state).toBe('fits');
  });

  it('says where a switch named after a talent disagrees with the talents', async () => {
    const hunter = await loadSpecPresets('hunter');
    const bm = characterFromPresets(hunter, 'bm');
    const mm = characterFromPresets(hunter, 'mm');
    expect(switchTalentNote(bm, { name: 'Use Summon Hawk', on: false })).toBe('unused');
    expect(switchTalentNote(bm, { name: 'Use Summon Hawk', on: true })).toBeNull();
    expect(switchTalentNote(mm, { name: 'Use Summon Hawk', on: true })).toBe('untaken');
    expect(switchTalentNote(mm, { name: 'Use Summon Hawk', on: false })).toBeNull();
    // Not a talent, or not a "Use …" switch.
    expect(switchTalentNote(bm, { name: 'Use Multi-Shot', on: false })).toBeNull();
    expect(switchTalentNote(bm, { name: 'Melee weave', on: false })).toBeNull();
  });

  it('has nothing to say without builds, or with another spec’s presets', async () => {
    const druid = await loadSpecPresets('balance-druid');
    expect(rotationAdvice(characterFromPresets(druid), druid)).toBeNull();
    const hunter = await loadSpecPresets('hunter');
    expect(rotationAdvice(characterFromPresets(druid), hunter)).toBeNull();
  });

  it('names the picked rotation in the import note', async () => {
    const notes: Diagnostic[] = [
      { code: 'SPEC-06', severity: 'info', message: 'Spec not in the export.', field: 'spec' },
      { code: 'DEFAULT-05', severity: 'info', message: 'Rotation not in the export.', field: 'rotation' },
    ];
    const hunter = await loadSpecPresets('hunter');
    const imported = {
      ...characterFromPresets(hunter, 'bm'),
      rotation: { kind: 'preset' as const, presetId: '' },
    };
    const out = withRotationPick(notes, fillFromPreset(imported, hunter), hunter);
    expect(out[0]).toBe(notes[0]);
    expect(out[1]!.message).toBe(
      'Rotation not in the export. Using Turret (Hawks): upstream plays it with its BM build, the closest to these talents. Change it on the Workbench’s Rotation tab.',
    );

    const druid = await loadSpecPresets('balance-druid');
    const moonkin = fillFromPreset(withRotation(characterFromPresets(druid), ''), druid);
    expect(withRotationPick(notes, moonkin, druid)[1]!.message).toContain(
      'Using Default, upstream’s default for the spec.',
    );
  });
});
