import { describe, expect, it } from 'vitest';
import { iterationsForCi, percentilesOf, quantileSorted, summarize } from './stats';
import { distributionHistogram, engineHistogram, histogram, sharedRange } from './histogram';
import { convergence, logCheckpoints } from './convergence';
import { raidFixture } from './testFixtures';

const dps = () => raidFixture().raidMetrics!.dps!;

describe('summarize (fixture: SV hunter, 5,000 iterations)', () => {
  it('matches an independent computation (Python statistics module, hand-run)', () => {
    // Computed outside this package with Python's math.fsum and statistics.quantiles(method="inclusive"),
    // which is the same type-7 interpolation as NumPy's default.
    const s = summarize(dps(), raidFixture().iterationsDone);
    expect(s.n).toBe(5000);
    expect(s.mean).toBeCloseTo(850.1967885938788, 9);
    expect(s.stdev).toBeCloseTo(28.680836053709974, 9);
    expect(s.ci95).toBeCloseTo(0.7949776074476554, 9);
    expect(s.percentiles!.p5).toBeCloseTo(804.5643923849968, 9);
    expect(s.percentiles!.median).toBeCloseTo(849.8096621138554, 9);
    expect(s.percentiles!.p95).toBeCloseTo(899.2009868800424, 9);
    expect(s.min).toBe(763.0782855585019);
    expect(s.max).toBe(961.7594414743392);
    expect(s.cv).toBeCloseTo(28.680836053709974 / 850.1967885938788, 12);
  });

  it('recomputes mean and population stdev from allValues the same as the engine reports', () => {
    const v = dps().allValues;
    let sum = 0;
    for (const x of v) sum += x;
    const mean = sum / v.length;
    let ss = 0;
    for (const x of v) ss += (x - mean) ** 2;
    expect(mean).toBeCloseTo(dps().avg, 9);
    expect(Math.sqrt(ss / v.length)).toBeCloseTo(dps().stdev, 8);
  });

  it('defaults n to the engine aggregator count', () => {
    expect(summarize(dps()).n).toBe(5000);
  });

  it('reports percentiles as unavailable without allValues', () => {
    const s = summarize({ ...dps(), allValues: [] });
    expect(s.percentiles).toBeNull();
    expect(s.mean).toBe(dps().avg);
  });
});

describe('quantiles', () => {
  it('interpolates linearly between order statistics (type 7)', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([1, 2, 3, 4], 0.05)).toBeCloseTo(1.15, 12);
    expect(quantileSorted([10], 0.95)).toBe(10);
    expect(percentilesOf([5, 1, 3])).toEqual({ p5: 1.2, median: 3, p95: 4.8 });
  });

  it('iterationsForCi inverts the CI formula', () => {
    const n = iterationsForCi(28.68, 0.85);
    expect(n).toBe(Math.ceil(((1.959963984540054 * 28.68) / 0.85) ** 2));
  });
});

describe('histogram', () => {
  it('bins every value into equal bins over the auto range', () => {
    const h = histogram(dps().allValues, { bins: 40 });
    expect(h.counts).toHaveLength(40);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5000);
    expect(h.lo).toBe(dps().min);
    expect(h.hi).toBe(dps().max);
    expect(h.counts[39]).toBeGreaterThan(0); // max lands in the last bin
  });

  it('counts out-of-range values separately and shares bins across runs', () => {
    const range = sharedRange([dps().allValues, [700, 1000]], { step: 10 });
    expect(range).toEqual([700, 1000]);
    const h = histogram(dps().allValues, { bins: 30, range: [800, 900] });
    expect(h.binWidth).toBeCloseTo(100 / 30, 12);
    const below = dps().allValues.filter((x) => x < 800).length;
    const above = dps().allValues.filter((x) => x > 900).length;
    expect(h.underflow).toBe(below);
    expect(h.overflow).toBe(above);
    expect(h.total + below + above).toBe(5000);
  });

  it('reads the engine hist as centred bins and reproduces it from allValues', () => {
    const e = engineHistogram(dps());
    expect(e.source).toBe('engineHist');
    expect(e.binWidth).toBe(5);
    expect(e.lo).toBe(762.5);
    expect(e.total).toBe(5000);
    // The engine's key is round(v/5)*5, so the same bins built from allValues must match exactly.
    const re = histogram(dps().allValues, { bins: e.counts.length, range: [e.lo, e.hi] });
    expect(re.counts).toEqual(e.counts);
  });

  it('falls back to the engine hist when allValues is absent', () => {
    expect(distributionHistogram(dps()).source).toBe('allValues');
    expect(distributionHistogram({ ...dps(), allValues: [] }).source).toBe('engineHist');
  });
});

describe('convergence', () => {
  it('produces log-spaced checkpoints ending at n', () => {
    const c = logCheckpoints(50, 5000, 60);
    expect(c[0]).toBe(50);
    expect(c[c.length - 1]).toBe(5000);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
  });

  it('matches independent running mean and CI at fixed counts', () => {
    const conv = convergence(dps().allValues, { start: 50, points: 60 });
    const at = (n: number) => conv.points.find((p) => p.n === n)!;
    // Python, population stdev of the first n values.
    expect(at(50).mean).toBeCloseTo(849.3843690633911, 9);
    expect(at(50).ci95).toBeCloseTo(7.377752592507427, 9);
    const last = conv.points[conv.points.length - 1]!;
    expect(last.n).toBe(5000);
    expect(last.mean).toBeCloseTo(850.1967885938788, 9);
    expect(last.ci95).toBeCloseTo(0.7949776074476554, 9);
  });

  it('finds the stable point by the documented rule', () => {
    const conv = convergence(dps().allValues);
    const tol = 0.0025 * conv.points[conv.points.length - 1]!.mean;
    expect(conv.stableAfter).not.toBeNull();
    const idx = conv.points.findIndex((p) => p.n === conv.stableAfter);
    for (const p of conv.points.slice(idx)) {
      expect(p.ci95).toBeLessThanOrEqual(tol);
      expect(Math.abs(p.mean - 850.1967885938788)).toBeLessThanOrEqual(tol);
    }
    const before = conv.points[idx - 1]!;
    expect(before.ci95 > tol || Math.abs(before.mean - 850.1967885938788) > tol).toBe(true);
    // CI ≤ 2.125 needs n ≈ (1.96·28.68/2.125)² ≈ 700 at the final stdev; the running stdev of the
    // first few hundred values is a little lower, so the fixture settles at 657.
    expect(conv.stableAfter).toBe(657);
    // A tighter tolerance than the run supports never stabilises.
    expect(convergence(dps().allValues, { tolerance: 0.0005 }).stableAfter).toBeNull();
  });
});
