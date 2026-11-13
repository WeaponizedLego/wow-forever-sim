import type { DistributionMetrics } from '@fsim/proto/api';

/** Two-sided 95% normal quantile. Every "CI95" in this package is `Z95 · standard error`. */
export const Z95 = 1.959963984540054;

/** p5 / median / p95 of the per-iteration values. */
export interface Percentiles {
  p5: number;
  median: number;
  p95: number;
}

export interface Summary {
  /** Iterations behind the numbers. */
  n: number;
  mean: number;
  /**
   * Standard deviation of one iteration's value, as the engine reports it. The engine divides by n
   * (population stdev); at the iteration counts we run the difference from n − 1 is negligible.
   */
  stdev: number;
  /** Standard error of the mean, stdev / √n. */
  se: number;
  /** Half-width of the 95% confidence interval of the mean (normal approximation, Z95 · se). */
  ci95: number;
  /** Coefficient of variation, stdev / |mean|. Null when the mean is 0. */
  cv: number | null;
  min: number;
  max: number;
  /**
   * Null when the result carries no per-iteration values (`simOptions.saveAllValues` was off):
   * the engine's pre-binned `hist` is too coarse to read percentiles from, so we do not guess.
   */
  percentiles: Percentiles | null;
}

/**
 * Quantile of an ascending-sorted array by linear interpolation between order statistics
 * (Hyndman–Fan type 7, the default of R, NumPy and Excel's PERCENTILE.INC).
 */
export function quantileSorted(sorted: readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 0) throw new Error('quantile of an empty array');
  if (q <= 0) return sorted[0]!;
  if (q >= 1) return sorted[n - 1]!;
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const a = sorted[lo]!;
  const b = sorted[Math.min(lo + 1, n - 1)]!;
  return a + (h - lo) * (b - a);
}

export function percentilesOf(values: readonly number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: quantileSorted(sorted, 0.05),
    median: quantileSorted(sorted, 0.5),
    p95: quantileSorted(sorted, 0.95),
  };
}

/**
 * Headline statistics of one engine distribution (DPS, HPS, …).
 *
 * `n` defaults to the engine's own count (`aggregatorData.n`), else the number of saved values.
 * Pass `RaidSimResult.iterationsDone` when you have it.
 */
export function summarize(dist: DistributionMetrics, n?: number): Summary {
  const count = n ?? (dist.aggregatorData?.n || dist.allValues.length);
  if (!(count > 0)) throw new Error('summarize: iteration count unknown; pass n');
  const se = dist.stdev / Math.sqrt(count);
  return {
    n: count,
    mean: dist.avg,
    stdev: dist.stdev,
    se,
    ci95: Z95 * se,
    cv: dist.avg === 0 ? null : dist.stdev / Math.abs(dist.avg),
    min: dist.min,
    max: dist.max,
    percentiles: dist.allValues.length > 0 ? percentilesOf(dist.allValues) : null,
  };
}

/**
 * Iterations needed for the CI95 half-width of the mean to reach `halfWidth` (same unit as stdev),
 * e.g. the Workbench "until ±0.1%" button: `iterationsForCi(stdev, 0.001 * mean)`.
 */
export function iterationsForCi(stdev: number, halfWidth: number): number {
  if (!(halfWidth > 0)) throw new Error('iterationsForCi: halfWidth must be > 0');
  return Math.ceil(((Z95 * stdev) / halfWidth) ** 2);
}
