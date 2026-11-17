import { describe, expect, it } from 'vitest';
import type { AbilityRow } from '@fsim/analysis';
import { PseudoStat, Stat, UnitStats } from '@fsim/proto/common';
import { abilityCompareRows, statDiffRows, vsBaseline, type CompareStatDef } from './compare-rows';

describe('vsBaseline', () => {
  const ref = { mean: 1000, stdev: 100, n: 5000 };

  it('marks the baseline as the reference', () => {
    expect(vsBaseline(ref, ref, true)).toMatchObject({ delta: 0, p: null, verdict: 'reference' });
  });

  it('calls a clear gain up, a clear loss down, and a small one noise', () => {
    expect(vsBaseline({ ...ref, mean: 1020 }, ref, false).verdict).toBe('up');
    expect(vsBaseline({ ...ref, mean: 980 }, ref, false).verdict).toBe('down');
    const small = vsBaseline({ ...ref, mean: 1002 }, ref, false);
    expect(small.verdict).toBe('noise');
    // 1.96 · √(2 · 100² / 5000) ≈ 3.92
    expect(small.noise).toBeCloseTo(3.92, 2);
    expect(small.delta).toBeCloseTo(2, 6);
  });
});

describe('statDiffRows', () => {
  const sheet = (str: number, crit: number) =>
    UnitStats.create({
      stats: Object.assign([], { [Stat.StatStrength]: str, [Stat.StatAgility]: 50 }),
      pseudoStats: Object.assign([], { [PseudoStat.PseudoStatMeleeCritPercent]: crit }),
    });
  const defs: CompareStatDef[] = [
    { label: 'Strength', src: { stat: Stat.StatStrength }, digits: 0 },
    { label: 'Agility', src: { stat: Stat.StatAgility }, digits: 0 },
    { label: 'Melee crit', src: { pseudo: PseudoStat.PseudoStatMeleeCritPercent }, digits: 2, pct: true },
  ];

  it('keeps only stats where some variant differs from A at the shown precision', () => {
    const rows = statDiffRows([sheet(100, 5), sheet(100.2, 5.001), sheet(110, 5)], defs);
    expect(rows).toEqual([{ label: 'Strength', digits: 0, pct: false, values: [100, 100.2, 110] }]);
  });

  it('keeps a missing sheet as null and lists nothing without A', () => {
    expect(statDiffRows([sheet(100, 5), null, sheet(100, 6)], defs)).toEqual([
      { label: 'Melee crit', digits: 2, pct: true, values: [5, null, 6] },
    ]);
    expect(statDiffRows([null, sheet(1, 1)], defs)).toEqual([]);
  });
});

describe('abilityCompareRows', () => {
  const ab = (key: string, dps: number) =>
    ({ key, id: { kind: 'spell', id: Number(key), tag: 0 }, dps }) as unknown as AbilityRow;

  it('lines abilities up across variants, biggest (in any variant) first', () => {
    const rows = abilityCompareRows([[ab('1', 300), ab('2', 100)], [ab('1', 310), ab('3', 400)], null], 2);
    expect(rows.map((r) => [r.key, r.dps])).toEqual([
      ['3', [0, 400, null]],
      ['1', [300, 310, null]],
    ]);
  });
});
