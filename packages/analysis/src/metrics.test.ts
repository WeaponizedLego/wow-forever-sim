import { describe, expect, it } from 'vitest';
import { Stat } from '@fsim/proto';
import { ResourceType } from '@fsim/proto/spell';
import { abilityBreakdown, findPlayer } from './abilities';
import { auraUptimes, resourceWaste } from './auras';
import { linearEstimate, statWeightRows, type StatRef } from './weights';
import { raidFixture, weightsFixture } from './testFixtures';

const N = 5000;
const DUR = 180.0485126888104;

describe('abilityBreakdown (fixture)', () => {
  const rows = abilityBreakdown(raidFixture());
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it('returns only damaging abilities, sorted by DPS, summing to the player DPS', () => {
    expect(rows.map((r) => r.key)).toEqual([
      'other:4',
      'spell:14287',
      'spell:20904',
      'spell:13555',
      'item:18588',
    ]);
    const total = rows.reduce((s, r) => s + r.dps, 0);
    // Σ damage / (n · avg duration) vs the engine's mean of per-iteration DPS: same within 0.01%.
    expect(total).toBeCloseTo(850.2020616636405, 6);
    expect(Math.abs(total - raidFixture().raidMetrics!.dps!.avg) / total).toBeLessThan(1e-4);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 12);
  });

  it('ignores self-damage (Demonic Rune hits the player, not an enemy)', () => {
    expect(rows.find((r) => r.key === 'item:12662')).toBeUndefined();
  });

  it('computes Auto Shot by hand', () => {
    // targets[0]: casts 344014, hits 272296, crits 71718, damage 323271994.37…
    const r = row('other:4');
    expect(r.dps).toBeCloseTo(323271994.3654 / N / DUR, 2);
    expect(r.casts).toBeCloseTo(344014 / N, 10);
    expect(r.castsPerMinute).toBeCloseTo(344014 / N / (DUR / 60), 10);
    expect(r.critRate).toBeCloseTo(71718 / 344014, 12);
    expect(r.outcomes.hit).toBeCloseTo(272296 / 344014, 12);
    expect(r.outcomes.glance).toBe(0);
    expect(r.avgHit).toBeCloseTo(r.damagePerFight / (344014 / N), 6);
    expect(r.basis).toBe('direct');
  });

  it('counts misses in the outcome mix (item 18588, a thrown bomb that can miss)', () => {
    const r = row('item:18588');
    const total = 10825 + 2608 + 1567;
    expect(r.outcomes.other).toBeCloseTo(1567 / total, 12);
    expect(r.outcomes.hit + r.outcomes.crit + r.outcomes.glance + r.outcomes.other).toBeCloseTo(1, 12);
  });

  it('describes DoT-only damage by its ticks (Serpent Sting)', () => {
    const r = row('spell:13555');
    expect(r.basis).toBe('ticks');
    expect(r.critRate).toBeCloseTo(58258 / (220947 + 58258), 12);
    expect(r.avgHit).toBeCloseTo(r.damagePerFight / ((220947 + 58258) / N), 6);
  });

  it('has no per-ability error field', () => {
    expect(Object.keys(rows[0]!)).not.toContain('err');
    expect(Object.keys(rows[0]!)).not.toContain('dpsStdev');
  });
});

describe('auraUptimes / resourceWaste (fixture)', () => {
  const player = findPlayer(raidFixture())!;

  it('turns uptime seconds into fractions of the fight', () => {
    const rows = auraUptimes(player, DUR);
    const rapidFire = rows.find((r) => r.key === 'spell:3045')!;
    expect(rapidFire.uptimeSeconds).toBeCloseTo(15, 0);
    expect(rapidFire.uptime).toBeCloseTo(rapidFire.uptimeSeconds / DUR, 12);
    expect(rapidFire.procsPerFight).toBeCloseTo(1, 6);
    expect(rows.every((r) => r.uptime >= 0 && r.uptime <= 1)).toBe(true);
    expect(rows.every((r) => r.uptimeSeconds > 0)).toBe(true);
  });

  it('estimates mana overflow from gain vs actualGain', () => {
    const rows = resourceWaste(player, N);
    expect(rows.map((r) => r.type)).toEqual([ResourceType.ResourceTypeMana]);
    const mana = rows[0]!;
    expect(mana.approximate).toBe(true);
    // Independent sum over the fixture's positive mana gains.
    const gains = [
      [22539896.946622156, 22534754.407166693],
      [5193367.202665193, 2260335.9481380093],
      [3413600, 3404981.9839305067],
      [8342621.476292353, 8342621.476292351],
      [11651379.880553978, 11651379.880553978],
      [19624993, 19614183.927543536],
    ] as const;
    const gained = gains.reduce((s, [g]) => s + g, 0);
    const wasted = gains.reduce((s, [g, a]) => s + Math.max(0, g - a), 0);
    expect(mana.gainedPerFight).toBeCloseTo(gained / N, 6);
    expect(mana.wastedPerFight).toBeCloseTo(wasted / N, 6);
    expect(mana.wastedFraction).toBeCloseTo(wasted / gained, 10);
    expect(mana.sources[0]!.key).toBe('other:2#2');
  });
});

describe('stat weights (fixture)', () => {
  const refs: StatRef[] = [
    { kind: 'stat', stat: Stat.StatAgility },
    { kind: 'stat', stat: Stat.StatRangedAttackPower },
    { kind: 'stat', stat: Stat.StatStrength },
  ];
  const rows = statWeightRows(weightsFixture(), refs);

  it('reads weight, stdev, CI95, EP and relative error', () => {
    const [agi, rap, str] = rows;
    expect(agi!.weight).toBeCloseTo(0.7879839707049089, 14);
    expect(agi!.stdev).toBeCloseTo(0.34671760481417124, 14);
    expect(agi!.ci95).toBeCloseTo(1.959963984540054 * 0.34671760481417124, 12);
    expect(agi!.ep).toBeCloseTo(3.409526484493229, 12);
    expect(agi!.relError).toBeCloseTo(0.34671760481417124 / 0.7879839707049089, 12);
    expect(agi!.samples).toBe(2000);
    expect(rap!.ep).toBe(1);
    expect(str!.weight).toBe(0);
    expect(str!.relError).toBeNull();
  });

  it('propagates a linear estimate with independent errors', () => {
    const est = linearEstimate(
      [
        { ref: { kind: 'stat', stat: Stat.StatAgility }, amount: 10 },
        { ref: { kind: 'stat', stat: Stat.StatRangedAttackPower }, amount: -20 },
        { ref: { kind: 'stat', stat: Stat.StatHitRating }, amount: 1 },
      ],
      rows,
    );
    expect(est.delta).toBeCloseTo(10 * 0.7879839707049089 - 20 * 0.2311124357850618, 12);
    expect(est.stdev).toBeCloseTo(Math.hypot(10 * 0.34671760481417124, 20 * 0.00781993312140753), 12);
    expect(est.ci95).toBeCloseTo(1.959963984540054 * est.stdev, 12);
    expect(est.missing).toEqual([{ kind: 'stat', stat: Stat.StatHitRating }]);
    expect(est.terms).toHaveLength(2);
  });

  it('matches the Workbench mockup arithmetic (+6.8 ±1.4 and +2.1 ±0.3 → +8.9 ±1.7 shown)', () => {
    // Two independent terms combine in quadrature: √(1.4² + 0.3²) = 1.43. The mockup's ±1.7 adds
    // them linearly-ish; our propagated value is the independent-errors one.
    const w = [
      { ref: { kind: 'stat', stat: 0 } as StatRef, weight: 6.8, stdev: 1.4 / 1.959963984540054 },
      { ref: { kind: 'stat', stat: 1 } as StatRef, weight: 2.1, stdev: 0.3 / 1.959963984540054 },
    ].map((x) => ({ ...x, ci95: 0, ep: 0, epStdev: 0, relError: null, samples: null }));
    const est = linearEstimate(
      [
        { ref: { kind: 'stat', stat: 0 }, amount: 1 },
        { ref: { kind: 'stat', stat: 1 }, amount: 1 },
      ],
      w,
    );
    expect(est.delta).toBeCloseTo(8.9, 12);
    expect(est.ci95).toBeCloseTo(Math.hypot(1.4, 0.3), 12);
  });
});
