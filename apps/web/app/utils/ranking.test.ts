import { describe, expect, it } from 'vitest';
import { iterationsLabel, noiseFloorText, passNoiseFloors, rankResults, type ComboResult } from './ranking';

const res = (key: string, mean: number, n: number, stdev = 30): ComboResult => ({
  key,
  changes: key ? [{ slot: 'head', itemId: Number(key) }] : [],
  mean,
  stdev,
  n,
  ci95: (1.96 * stdev) / Math.sqrt(n),
});

describe('rankResults', () => {
  it('one pass: every row against the equipped set, sorted by Δ', () => {
    const ref = res('', 1000, 250);
    const rows = rankResults({ '': ref, '1': res('1', 990, 250), '2': res('2', 1020, 250) }, ref);
    expect(rows.map((r) => [r.key, r.rank, r.delta, r.verdict, r.rerun])).toEqual([
      ['2', 1, 20, 'up', false],
      ['', 2, 0, 'reference', false],
      ['1', 3, -10, 'down', false],
    ]);
    for (const r of rows) expect(r.quickDelta).toBe(r.delta);
  });

  it('after a re-run: re-run rows against the re-run equipped set, the rest against the quick pass', () => {
    // The QA case: a drop +4 on the 250-iteration pass ends at −2.3 against the 10k equipped mean.
    const quick = { '': res('', 1000, 250), '1': res('1', 1004, 250) };
    const ref = res('', 1001, 10_000);
    const results = {
      '': ref,
      '1': res('1', 998.7, 10_000),
      // Not re-run: still the 250-iteration result.
      '2': res('2', 1003, 250),
    };
    const rows = rankResults(results, ref, { quick, baseIterations: 250 });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey['1']).toMatchObject({ rerun: true, verdict: 'down' });
    expect(byKey['1']!.delta).toBeCloseTo(-2.3, 6);
    expect(byKey['1']!.quickDelta).toBeCloseTo(4, 6);
    // 10k vs 10k: a much tighter bar than the quick pass.
    expect(byKey['1']!.noise).toBeLessThan(1);

    // Against the quick-pass equipped mean (1000), not the 10k one (1001), and at the quick pass's noise.
    expect(byKey['2']).toMatchObject({ rerun: false, verdict: 'noise', delta: 3, quickDelta: 3 });
    expect(byKey['2']!.noise).toBeGreaterThan(5);

    expect(byKey['']).toMatchObject({ equipped: true, rerun: false, delta: 0, verdict: 'reference' });
    expect(rows.map((r) => r.key)).toEqual(['2', '', '1']);
  });

  it('per-pass noise floors for the header and the ranking note', () => {
    const quick = { '': res('', 1000, 250), '1': res('1', 1004, 250) };
    const ref = res('', 1001, 10_000);
    const rows = rankResults(
      { '': ref, '1': res('1', 998.7, 10_000), '2': res('2', 1003, 250), '3': res('3', 995, 250) },
      ref,
      { quick, baseIterations: 250 },
    );
    const f = passNoiseFloors(rows);
    expect(f.quick).toBeCloseTo(1.96 * Math.sqrt(2 * (900 / 250)), 3);
    expect(f.final!.n).toBe(10_000);
    expect(f.final!.noise).toBeCloseTo(1.96 * Math.sqrt(2 * (900 / 10_000)), 3);
    expect(noiseFloorText(rows, 250)).toBe('±5.3 at 250 it · ±0.8 at 10k');

    const onePass = rankResults({ '': quick[''], '1': quick['1'] }, quick['']);
    expect(passNoiseFloors(onePass).final).toBeNull();
    expect(noiseFloorText(onePass, 250)).toBe('±5.3 at 250 it');
    expect(noiseFloorText([], 250)).toBeNull();
  });

  it('labels iteration counts', () => {
    expect(iterationsLabel(10_000)).toBe('10k');
    expect(iterationsLabel(25_000)).toBe('25k');
    expect(iterationsLabel(500)).toBe('500');
  });
});
