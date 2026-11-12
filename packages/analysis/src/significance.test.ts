import { describe, expect, it } from 'vitest';
import {
  lnGamma,
  noiseFloor,
  normalCdf,
  regularizedIncompleteBeta,
  studentTCdf,
  studentTTwoSidedP,
  welchTTest,
} from './significance';
import { summarize } from './stats';
import { raidFixture } from './testFixtures';

describe('special functions', () => {
  it('lnGamma matches known values', () => {
    expect(lnGamma(1)).toBeCloseTo(0, 13);
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 13);
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 13);
    // Python math.lgamma
    expect(lnGamma(100.5)).toBeCloseTo(361.4355404677776, 9);
    expect(lnGamma(1000.25)).toBeCloseTo(5906.947268271117, 8);
  });

  it('regularized incomplete beta matches closed forms', () => {
    // I_x(a, 1) = x^a ; I_x(1, b) = 1 − (1−x)^b ; I_x(a, a) at 0.5 = 0.5
    expect(regularizedIncompleteBeta(0.3, 2.5, 1)).toBeCloseTo(0.3 ** 2.5, 13);
    expect(regularizedIncompleteBeta(0.3, 1, 4)).toBeCloseTo(1 - 0.7 ** 4, 13);
    expect(regularizedIncompleteBeta(0.5, 7.3, 7.3)).toBeCloseTo(0.5, 13);
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
  });

  it('Student-t CDF matches closed forms for df = 1, 2, 4', () => {
    for (const t of [-3, -0.7, 0, 0.4, 1, 2.5, 10]) {
      expect(studentTCdf(t, 1)).toBeCloseTo(0.5 + Math.atan(t) / Math.PI, 12);
      expect(studentTCdf(t, 2)).toBeCloseTo(0.5 + t / (2 * Math.sqrt(t * t + 2)), 12);
      const x = t / Math.sqrt(t * t + 4);
      expect(studentTCdf(t, 4)).toBeCloseTo(0.5 + (3 / 4) * x * (1 - (x * x) / 3), 12);
    }
  });

  it('Student-t two-sided p matches published critical values', () => {
    // t-table: t_{0.975} for df 1, 5, 10, 30, 120 and the normal limit.
    expect(studentTTwoSidedP(12.706204736, 1)).toBeCloseTo(0.05, 8);
    expect(studentTTwoSidedP(2.570581836, 5)).toBeCloseTo(0.05, 8);
    expect(studentTTwoSidedP(2.228138852, 10)).toBeCloseTo(0.05, 8);
    expect(studentTTwoSidedP(2.042272456, 30)).toBeCloseTo(0.05, 8);
    expect(studentTTwoSidedP(1.979930405, 120)).toBeCloseTo(0.05, 8);
    expect(studentTTwoSidedP(2.576, Infinity)).toBeCloseTo(0.01, 4);
    // t_{0.995}, df 20 = 2.845339710 → p = 0.01
    expect(studentTTwoSidedP(2.84533971, 20)).toBeCloseTo(0.01, 8);
    // Large df approaches the normal.
    expect(studentTCdf(1.959963985, 1e7)).toBeCloseTo(0.975, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
  });
});

describe('welchTTest', () => {
  it('computes t, Welch–Satterthwaite df and p for a textbook case', () => {
    const r = welchTTest({ mean: 20, stdev: 2, n: 10 }, { mean: 18, stdev: 3, n: 12 });
    expect(r.delta).toBe(2);
    expect(r.se).toBeCloseTo(Math.sqrt(0.4 + 0.75), 12);
    expect(r.t).toBeCloseTo(2 / Math.sqrt(1.15), 12);
    expect(r.df).toBeCloseTo(1.3225 / (0.16 / 9 + 0.5625 / 11), 10);
    expect(r.p).toBeCloseTo(2 * (1 - studentTCdf(r.t, r.df)), 12);
    expect(r.p).toBeGreaterThan(0.05);
    expect(r.verdict).toBe('noise');
  });

  it('calls a clear difference better or worse, respecting direction and minDelta', () => {
    const base = { mean: 1161.8, stdev: 114.0, n: 5000 };
    const run = { mean: 1184.2, stdev: 112.4, n: 5000 };
    expect(welchTTest(run, base).verdict).toBe('better');
    expect(welchTTest(base, run).verdict).toBe('worse');
    expect(welchTTest(run, base, { higherIsBetter: false }).verdict).toBe('worse');
    expect(welchTTest(run, base, { minDelta: 30 }).verdict).toBe('noise');
  });

  it('agrees with the noise floor at large n', () => {
    const fx = summarize(raidFixture().raidMetrics!.dps!);
    const a = { mean: fx.mean, stdev: fx.stdev, n: fx.n };
    const floor = noiseFloor(a, a);
    expect(floor).toBeCloseTo(1.959963984540054 * Math.sqrt(2) * (fx.stdev / Math.sqrt(fx.n)), 12);
    // Δ just over the floor is significant at 5%, just under is not.
    expect(welchTTest({ ...a, mean: a.mean + floor * 1.01 }, a).verdict).toBe('better');
    expect(welchTTest({ ...a, mean: a.mean + floor * 0.99 }, a).verdict).toBe('noise');
  });

  it('matches the Top gear mockup: CI ±3.1 per row → noise floor ≈ 4.4', () => {
    // Per-run CI95 3.1 ⇒ se = 3.1 / 1.96; two equal runs ⇒ floor = 1.96·√2·se = √2·3.1.
    const n = 1000;
    const stdev = (3.1 / 1.959963984540054) * Math.sqrt(n);
    expect(noiseFloor({ mean: 0, stdev, n }, { mean: 0, stdev, n })).toBeCloseTo(4.38, 2);
  });
});
