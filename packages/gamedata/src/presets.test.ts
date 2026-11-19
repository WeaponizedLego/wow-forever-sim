import { SPECS, CharacterSchema } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { characterFromPresets, characterToPlayer } from './character';
import {
  buildLabel,
  closestBuild,
  findGearSet,
  findRotation,
  loadSpecPresets,
  PRESET_INDEX,
  rotationSwitches,
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

  it('labels a build with its group only where the name does not say it', () => {
    expect(buildLabel({ name: 'Pre-BiS', group: 'Fury' })).toBe('Fury Pre-BiS');
    expect(buildLabel({ name: 'Arcane Fire', group: 'Arcane' })).toBe('Arcane Fire');
    expect(buildLabel({ name: 'BM' })).toBe('BM');
  });
});
