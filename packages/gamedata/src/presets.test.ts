import { SPECS, CharacterSchema } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { characterFromPresets, characterToPlayer } from './character';
import { findGearSet, loadSpecPresets, PRESET_INDEX } from './presets';
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
});
