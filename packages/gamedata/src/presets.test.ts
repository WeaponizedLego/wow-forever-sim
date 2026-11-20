import { SPECS, CharacterSchema } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { characterFromPresets, characterToPlayer } from './character';
import {
  buildLabel,
  changedSettings,
  closestBuild,
  findGearSet,
  findRotation,
  loadSpecPresets,
  PRESET_INDEX,
  rotationApl,
  rotationLabel,
  rotationNumbers,
  rotationSwitches,
  setRotationSetting,
  suggestedRotation,
  talentDistance,
} from './presets';
import { fixtureDb } from './test-db';

const db = fixtureDb();

describe('spec presets', () => {
  it('has a file and an index entry for every engine spec', async () => {
    expect(PRESET_INDEX.specs.map((s) => s.specId).sort()).toEqual(SPECS.map((s) => s.id).sort());
    for (const spec of SPECS) {
      const p = await loadSpecPresets(spec.id);
      expect(p.specId).toBe(spec.id);
      expect(p.upstream.commit).toBe(PRESET_INDEX.commit);
    }
  });

  it('points only at gear sets, rotations and items that exist', async () => {
    for (const spec of SPECS) {
      const p = await loadSpecPresets(spec.id);
      for (const setup of [p.defaults, ...p.builds.map((b) => b.setup)]) {
        if (setup.gearSetId) expect(findGearSet(p, setup.gearSetId), `${spec.id} gear`).toBeDefined();
        if (setup.rotationId) {
          expect(p.rotations.find((r) => r.id === setup.rotationId)?.kind, `${spec.id} rotation`).toBe('apl');
        }
      }
      for (const g of p.gearSets) {
        for (const [slot, item] of Object.entries(g.gear)) {
          expect(db.items.has(item.itemId), `${spec.id} ${g.id} ${slot} ${item.itemId}`).toBe(true);
        }
      }
    }
  });

  it('turns every complete spec into a valid character and engine Player', async () => {
    const complete = PRESET_INDEX.specs.filter((s) => s.status === 'complete');
    expect(complete.length).toBeGreaterThanOrEqual(10);
    for (const s of complete) {
      const presets = await loadSpecPresets(s.specId);
      const builds = [s.defaultBuildId, ...presets.builds.map((b) => b.id)];
      for (const buildId of builds) {
        const character = characterFromPresets(presets, buildId);
        expect(CharacterSchema.safeParse(character).success).toBe(true);
        const player = characterToPlayer(character, presets, db, {
          setup: buildId ? presets.builds.find((b) => b.id === buildId)!.setup : presets.defaults,
        });
        expect(player.spec.oneofKind, s.specId).toBeDefined();
        expect(player.rotation?.priorityList.length, `${s.specId} ${buildId}`).toBeGreaterThan(0);
        expect(player.equipment?.items).toHaveLength(17);
      }
    }
  });

  it('finds the preset build closest to a talent string', async () => {
    expect(talentDistance('5-05', '5-05')).toBe(0);
    // Short trees and missing trees read as zeros.
    expect(talentDistance('53', '5-2')).toBe(5);
    expect(talentDistance('', '12-3')).toBe(6);

    for (const spec of SPECS) {
      const p = await loadSpecPresets(spec.id);
      // Each build is its own closest match unless an earlier build has the very same talents.
      for (const b of p.builds) {
        const twin = p.builds.find((x) => x.setup.talents === b.setup.talents)!;
        expect(closestBuild(p, b.setup.talents)?.id, `${spec.id} ${b.id}`).toBe(twin.id);
      }
      expect(closestBuild(p, ''), spec.id).toBeNull();
      expect(closestBuild(p, '000-0'), spec.id).toBeNull();
    }

    const hunter = await loadSpecPresets('hunter');
    // 11 points in Beast Mastery at level 20: still nearest to a build that goes down that tree.
    expect(closestBuild(hunter, '53201')?.id).toBe('bm');
    const s = suggestedRotation(hunter, '5320001505101251-00530502014');
    expect([s?.build.id, s?.rotation.id]).toEqual(['bm', 'turret-hawks']);
    expect(suggestedRotation(await loadSpecPresets('balance-druid'), '5-5-5')).toBeNull();
  });

  it("reads a rotation's fixed on/off settings", async () => {
    const hunter = await loadSpecPresets('hunter');
    const hawk = (id: string) =>
      rotationSwitches(findRotation(hunter, id)!).find((x) => x.name === 'Use Summon Hawk')?.on;
    expect(hawk('turret-hawks')).toBe(true);
    expect(hawk('turret')).toBe(false);
    expect(hawk('melee-weave-max')).toBe(false);
    expect(rotationSwitches(findRotation(hunter, 'simple')!)).toEqual([]);
    expect(rotationSwitches(findRotation(hunter, 'clean-weave')!)).toEqual([]);
  });

  it('applies changed settings, and stores only what differs from the rotation’s own', async () => {
    const hunter = await loadSpecPresets('hunter');
    const turret = findRotation(hunter, 'turret')!;
    const plain = { kind: 'preset' as const, presetId: 'turret' };
    const hawk = (changed?: Record<string, boolean>) =>
      rotationSwitches(turret, changed).find((x) => x.name === 'Use Summon Hawk');

    expect(hawk()).toEqual({ name: 'Use Summon Hawk', on: false, preset: false });
    expect(hawk({ 'Use Summon Hawk': true })).toEqual({ name: 'Use Summon Hawk', on: true, preset: false });
    expect(rotationNumbers(turret)).toEqual([
      { name: 'Shoot spot', value: 12, preset: 12, unit: '' },
      { name: 'Pull range', value: 25, preset: 25, unit: '' },
    ]);
    // Three decimals; a value that does not fit is ignored.
    expect(rotationNumbers(turret, { 'Shoot spot': 14.56789, 'Pull range': -1 }).map((n) => n.value)).toEqual(
      [14.568, 25],
    );

    const on = setRotationSetting(turret, plain, 'Use Summon Hawk', true);
    expect(on).toEqual({ ...plain, switches: { 'Use Summon Hawk': true } });
    const both = setRotationSetting(turret, on, 'Shoot spot', 15);
    expect(both).toEqual({ ...plain, switches: { 'Use Summon Hawk': true }, values: { 'Shoot spot': 15 } });
    expect(changedSettings(turret, both)).toEqual(['Use Summon Hawk on', 'Shoot spot 15']);
    // Put back, set to what it already is, the wrong kind of value, or not a setting of this rotation:
    // nothing is stored, and the rotation is the plain preset again.
    expect(setRotationSetting(turret, both, 'Use Summon Hawk', false)).toEqual({
      ...plain,
      values: { 'Shoot spot': 15 },
    });
    expect(setRotationSetting(turret, on, 'Use Summon Hawk', false)).toEqual(plain);
    expect(setRotationSetting(turret, plain, 'Use Aimed Shot', true)).toEqual(plain);
    expect(setRotationSetting(turret, plain, 'Shoot spot', 12)).toEqual(plain);
    expect(setRotationSetting(turret, plain, 'Shoot spot', Number.NaN)).toEqual(plain);
    expect(setRotationSetting(turret, plain, 'Pull range', true)).toEqual(plain);
    expect(setRotationSetting(turret, plain, 'Use Summon Hawk', 1)).toEqual(plain);
    expect(setRotationSetting(turret, plain, 'Melee weave', false)).toEqual(plain);
    expect(changedSettings(turret, { switches: { 'Melee weave': false }, values: { Nope: 3 } })).toEqual([]);
  });

  it('reads numbers with their unit: plain, percent and seconds', async () => {
    const bear = findRotation(await loadSpecPresets('feral-bear-druid'), 'adaptive-bear')!;
    expect(rotationNumbers(bear).map((n) => `${n.name}=${n.value}${n.unit}`)).toEqual([
      'Healthstone health threshold=30%',
      'Barkskin health threshold=60%',
      'Maul minimum rage=20',
    ]);
    const warlock = findRotation(await loadSpecPresets('warlock'), 'sm-ruin')!;
    expect(rotationNumbers(warlock)).toEqual([{ name: 'Doom tick', value: 60, preset: 60, unit: 's' }]);
    if (bear.kind !== 'apl' || warlock.kind !== 'apl') throw new Error('both are APLs');
    const val = (apl: Record<string, unknown>, name: string) =>
      (apl['valueVariables'] as { name: string; value: { const?: { val: string } } }[]).find(
        (v) => v.name === name,
      )?.value.const?.val;
    expect(
      val(rotationApl(bear, { values: { 'Barkskin health threshold': 45.5 } }), 'Barkskin health threshold'),
    ).toBe('45.5%');
    expect(val(rotationApl(warlock, { values: { 'Doom tick': 30 } }), 'Doom tick')).toBe('30s');
  });

  it('writes changed settings into the APL it sends, leaving the preset as it was', async () => {
    const hunter = await loadSpecPresets('hunter');
    const turret = findRotation(hunter, 'turret')!;
    if (turret.kind !== 'apl') throw new Error('turret is an APL');
    const before = JSON.stringify(turret.rotation);
    const val = (apl: Record<string, unknown>, name: string) =>
      (apl['valueVariables'] as { name: string; value: { const?: { val: string } } }[]).find(
        (v) => v.name === name,
      )?.value.const?.val;

    expect(rotationApl(turret)).toBe(turret.rotation);
    expect(rotationApl(turret, { switches: { 'Pull range': true }, values: { 'Shoot spot': 12 } })).toBe(
      turret.rotation,
    );
    const apl = rotationApl(turret, {
      switches: { 'Use Summon Hawk': true },
      values: { 'Shoot spot': 14.5 },
    });
    expect(val(apl, 'Use Summon Hawk')).toBe('true');
    expect(val(apl, 'Use Aimed Shot')).toBe('true');
    expect(val(apl, 'Shoot spot')).toBe('14.5');
    expect(val(apl, 'Pull range')).toBe('25');
    expect(apl['priorityList']).toBe(turret.rotation['priorityList']);
    expect(JSON.stringify(turret.rotation)).toBe(before);

    const character = {
      ...characterFromPresets(hunter, 'mm'),
      rotation: {
        kind: 'preset' as const,
        presetId: 'turret',
        switches: { 'Use Summon Hawk': true },
        values: { 'Shoot spot': 20 },
      },
    };
    const sent = characterToPlayer(CharacterSchema.parse(character), hunter, db).rotation!;
    const sentVal = (name: string) => sent.valueVariables.find((v) => v.name === name)!.value!.value;
    expect(sentVal('Use Summon Hawk')).toEqual({ oneofKind: 'const', const: { val: 'true' } });
    expect(sentVal('Shoot spot')).toEqual({ oneofKind: 'const', const: { val: '20' } });
  });

  it('names a rotation with what was changed in it', async () => {
    const hunter = await loadSpecPresets('hunter');
    const turret = (switches?: Record<string, boolean>) =>
      rotationLabel({ kind: 'preset', presetId: 'turret', switches }, hunter);
    expect(turret()).toBe('Turret');
    expect(turret({ 'Use Summon Hawk': true })).toBe('Turret · Use Summon Hawk on');
    expect(turret({ 'Use Summon Hawk': true, 'Use Aimed Shot': false })).toBe(
      'Turret · Use Aimed Shot off, Use Summon Hawk on',
    );
    expect(turret({ 'Use Summon Hawk': true, 'Use Aimed Shot': false, 'Use Multi-Shot': true })).toBe(
      'Turret · 3 settings changed',
    );
    const values = { 'Shoot spot': 15 };
    expect(rotationLabel({ kind: 'preset', presetId: 'turret', values }, hunter)).toBe(
      'Turret · Shoot spot 15',
    );
    const doom = { kind: 'preset' as const, presetId: 'sm-ruin', values: { 'Doom tick': 30 } };
    expect(rotationLabel(doom, await loadSpecPresets('warlock'))).toBe('SM/Ruin · Doom tick 30s');
    expect(rotationLabel({ kind: 'preset', presetId: 'turret' }, null)).toBe('turret');
    expect(rotationLabel({ kind: 'siml', source: 'x' }, hunter)).toBe('Custom SIML');
  });

  it('labels a build with its group only where the name does not say it', () => {
    expect(buildLabel({ name: 'Pre-BiS', group: 'Fury' })).toBe('Fury Pre-BiS');
    expect(buildLabel({ name: 'Arcane Fire', group: 'Arcane' })).toBe('Arcane Fire');
    expect(buildLabel({ name: 'BM' })).toBe('BM');
  });
});
