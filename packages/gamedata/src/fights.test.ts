import { EncounterSchema, DUNGEON_SLICE_SEGMENTS, FIGHT_STYLE_IDS, type Encounter } from '@fsim/contracts';
import { InputType } from '@fsim/proto/common';
import { RaidSimResult } from '@fsim/proto/api';
import { describe, expect, it } from 'vitest';
import { characterFromPresets } from './character';
import {
  effectiveEncounter,
  encounterProto,
  fightLabel,
  fightChange,
  fightSegments,
  SLICE_MOB_ID,
  sliceRanAsScheduled,
  withFightStyle,
} from './fights';
import { loadSpecPresets } from './presets';
import { buildRaidSimRequest } from './request';
import { fixtureDb } from './test-db';

const enc = (e: Record<string, unknown>): Encounter => EncounterSchema.parse(e);

describe('encounterProto', () => {
  it('Patchwerk: one level 63 boss, 3 or 5 minutes ± 5 s, execute on', () => {
    for (const [style, sec] of [
      ['patchwerk-3m', 180],
      ['patchwerk-5m', 300],
    ] as const) {
      const e = encounterProto(enc({ style }));
      expect(e.duration).toBe(sec);
      expect(e.durationVariation).toBe(5);
      expect(e.executeProportion20).toBe(0.2);
      expect(e.executeProportion35).toBe(0.35);
      expect(e.targets).toHaveLength(1);
      expect(e.targets[0]).toMatchObject({ id: 31146, level: 63, disabledAtStart: false, targetInputs: [] });
    }
  });

  it('a preset ignores stale fields; Custom uses them', () => {
    const stale: Encounter = {
      style: 'patchwerk-5m',
      durationSec: 77,
      durationVariationSec: 0,
      targetCount: 4,
      targetLevel: 60,
      executePhase: false,
    };
    expect(encounterProto(stale).duration).toBe(300);
    expect(encounterProto(stale).targets).toHaveLength(1);
    const custom = encounterProto({ ...stale, style: 'custom' });
    expect(custom.duration).toBe(77);
    expect(custom.targets.map((t) => t.level)).toEqual([60, 60, 60, 60]);
    expect(custom.executeProportion20).toBe(0);
  });

  it('dungeon slice: every mob of every pull, with its window as target inputs', () => {
    const e = encounterProto(enc({ style: 'dungeon-slice-5m' }));
    expect(e.duration).toBe(300);
    expect(e.durationVariation).toBe(0);
    const mobs = DUNGEON_SLICE_SEGMENTS.reduce((a, s) => a + s.mobs, 0);
    expect(e.targets).toHaveLength(mobs);
    let i = 0;
    for (const seg of DUNGEON_SLICE_SEGMENTS) {
      for (let k = 0; k < seg.mobs; k++, i++) {
        const t = e.targets[i]!;
        expect(t.id).toBe(SLICE_MOB_ID);
        expect(t.level).toBe(62);
        expect(t.canCrush).toBe(false);
        expect(t.disabledAtStart).toBe(seg.startSec > 0);
        expect(t.targetInputs.map((x) => [x.inputType, x.numberValue])).toEqual([
          [InputType.Number, seg.startSec],
          [InputType.Number, seg.endSec],
          [InputType.Number, 100],
        ]);
      }
    }
    expect(e.targets[0]!.name).toBe('Pack 1 · 1');
    expect(e.targets.find((t) => t.name === 'Boss')).toBeDefined();
  });

  it('every sim builds the same encounter through buildRaidSimRequest', async () => {
    const presets = await loadSpecPresets('hunter');
    const c = characterFromPresets(presets, 'sv');
    const req = buildRaidSimRequest(
      { ...c, encounter: withFightStyle(c.encounter, 'dungeon-slice-5m') },
      presets,
      fixtureDb(),
      { iterations: 10, seed: 1 },
    );
    expect(req.encounter).toEqual(encounterProto(enc({ style: 'dungeon-slice-5m' })));
  });
});

describe('the slice schedule', () => {
  it('fits in 5 minutes with downtime between pulls and at most 5 mobs at once', () => {
    let end = 0;
    for (const s of DUNGEON_SLICE_SEGMENTS) {
      expect(s.startSec).toBeGreaterThanOrEqual(end);
      expect(s.endSec).toBeGreaterThan(s.startSec);
      expect(s.mobs).toBeGreaterThanOrEqual(1);
      expect(s.mobs).toBeLessThanOrEqual(5);
      end = s.endSec;
    }
    expect(end).toBe(300);
    expect(DUNGEON_SLICE_SEGMENTS.filter((s) => s.kind === 'boss')).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('switching style brings the preset values; Custom keeps the last fight', () => {
    const slice = withFightStyle(enc({}), 'dungeon-slice-5m');
    expect(slice).toMatchObject({ style: 'dungeon-slice-5m', durationSec: 300, durationVariationSec: 0 });
    expect(withFightStyle(slice, 'custom')).toMatchObject({
      style: 'custom',
      durationSec: 300,
      targetCount: 5,
    });
    expect(withFightStyle(slice, 'patchwerk-3m')).toEqual(enc({}));
  });

  it('labels every style', () => {
    for (const style of FIGHT_STYLE_IDS) expect(fightLabel(enc({ style }))).toMatch(/\w/);
    expect(fightLabel(enc({ style: 'dungeon-slice-5m' }))).toBe('Dungeon slice 5 min');
    expect(fightLabel(enc({ style: 'custom', durationSec: 240, targetCount: 3, targetLevel: 62 }))).toBe(
      'Custom 240 s ±5 · 3 tgt · lvl 62',
    );
    expect(effectiveEncounter(enc({ style: 'patchwerk-5m' })).durationSec).toBe(300);
  });

  it('draws one segment for a stand-still fight, the pulls for a slice', () => {
    expect(fightSegments(enc({ style: 'patchwerk-5m' }))).toEqual([
      { kind: 'boss', label: 'Raid boss', mobs: 1, startSec: 0, endSec: 300 },
    ]);
    expect(fightSegments(enc({ style: 'dungeon-slice-5m' }))).toBe(DUNGEON_SLICE_SEGMENTS);
  });

  it('fightChange names both fights when they differ, by the values simmed', () => {
    expect(fightChange(enc({}), enc({ style: 'dungeon-slice-5m' }))).toEqual({
      from: 'Patchwerk 3 min',
      to: 'Dungeon slice 5 min',
    });
    expect(fightChange(enc({}), enc({}))).toBeNull();
    // A preset's stale fields are not a change; Custom's own fields are.
    expect(
      fightChange(enc({ style: 'patchwerk-5m', durationSec: 77 }), enc({ style: 'patchwerk-5m' })),
    ).toBeNull();
    expect(
      fightChange(enc({ style: 'custom', targetCount: 1 }), enc({ style: 'custom', targetCount: 3 })),
    ).toEqual({ from: 'Custom 180 s ±5 · 1 tgt', to: 'Custom 180 s ±5 · 3 tgt' });
  });
});

describe('sliceRanAsScheduled', () => {
  const slice = enc({ style: 'dungeon-slice-5m' });
  const firsts = DUNGEON_SLICE_SEGMENTS.map((_, i) =>
    DUNGEON_SLICE_SEGMENTS.slice(0, i).reduce((a, s) => a + s.mobs, 0),
  );
  const mobs = DUNGEON_SLICE_SEGMENTS.reduce((a, s) => a + s.mobs, 0);
  // Target unit indices after the one player, as the engine numbers them.
  const result = (hit: number[]) =>
    RaidSimResult.fromJson({
      raidMetrics: {
        parties: [
          {
            players: [{ actions: [{ targets: hit.map((i) => ({ unitIndex: 1 + i, damage: 100 })) }] }],
          },
        ],
      },
      encounterMetrics: { targets: Array.from({ length: mobs }, (_, i) => ({ unitIndex: 1 + i })) },
    });

  it('is true when every pull took damage', () => {
    expect(sliceRanAsScheduled(slice, result(firsts))).toBe(true);
  });

  it('is false when a later pull never spawned (engine without the patch)', () => {
    expect(sliceRanAsScheduled(slice, result([0, 1, 2, 3]))).toBe(false);
  });

  it('is true for a style without pulls', () => {
    expect(sliceRanAsScheduled(enc({ style: 'patchwerk-3m' }), result([]))).toBe(true);
  });
});
