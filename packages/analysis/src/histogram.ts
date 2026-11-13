import type { DistributionMetrics } from '@fsim/proto/api';

export interface Histogram {
  /** Where the counts came from. `engineHist` bins are the engine's own and ignore `bins`/`range`. */
  source: 'allValues' | 'engineHist';
  /** Left edge of the first bin. */
  lo: number;
  /** Right edge of the last bin. */
  hi: number;
  binWidth: number;
  /** counts[i] covers [lo + i·binWidth, lo + (i+1)·binWidth); the last bin also includes `hi`. */
  counts: number[];
  /** Values counted in the bins. */
  total: number;
  /** Values below `lo` / above `hi` (only non-zero when a fixed range was given). */
  underflow: number;
  overflow: number;
}

export interface HistogramOptions {
  /** Number of equal-width bins. Default 40 (the Run analysis chart). */
  bins?: number;
  /**
   * Fixed [lo, hi]. Pass the same range for run and baseline so their bins line up; see
   * `sharedRange`. Default: the min and max of the values.
   */
  range?: readonly [number, number];
}

/** Range covering every series, optionally padded and snapped outwards to a multiple of `step`. */
export function sharedRange(
  series: readonly (readonly number[])[],
  opts: { step?: number } = {},
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const v of s) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === Infinity) throw new Error('sharedRange: no values');
  const step = opts.step;
  if (step && step > 0) {
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
  }
  if (hi === lo) hi = lo + (step && step > 0 ? step : 1);
  return [lo, hi];
}

/** Bin raw values into equal-width bins. */
export function histogram(values: readonly number[], opts: HistogramOptions = {}): Histogram {
  const bins = opts.bins ?? 40;
  if (!(bins >= 1) || !Number.isInteger(bins)) throw new Error('histogram: bins must be a positive integer');
  const [lo, hi] = opts.range ?? sharedRange([values]);
  if (!(hi > lo)) throw new Error('histogram: range must have hi > lo');
  const binWidth = (hi - lo) / bins;
  const counts = new Array<number>(bins).fill(0);
  let underflow = 0;
  let overflow = 0;
  for (const v of values) {
    if (v < lo) underflow++;
    else if (v > hi) overflow++;
    else {
      const i = Math.min(bins - 1, Math.floor((v - lo) / binWidth));
      counts[i]!++;
    }
  }
  return {
    source: 'allValues',
    lo,
    hi,
    binWidth,
    counts,
    total: values.length - underflow - overflow,
    underflow,
    overflow,
  };
}

/**
 * The engine's pre-binned `hist`. Each key is a bin centre (`round(value / w) · w`), so a key k
 * covers [k − w/2, k + w/2). The width w is the smallest gap between keys; empty bins in between
 * are filled with 0.
 */
export function engineHistogram(dist: DistributionMetrics): Histogram {
  const entries = Object.entries(dist.hist)
    .map(([k, c]) => [Number(k), c] as const)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) throw new Error('engineHistogram: distribution has no hist');
  let w = Infinity;
  for (let i = 1; i < entries.length; i++) w = Math.min(w, entries[i]![0] - entries[i - 1]![0]);
  if (!Number.isFinite(w) || w <= 0) w = 1;
  const first = entries[0]![0];
  const last = entries[entries.length - 1]![0];
  const bins = Math.round((last - first) / w) + 1;
  const counts = new Array<number>(bins).fill(0);
  let total = 0;
  for (const [k, c] of entries) {
    counts[Math.round((k - first) / w)]! += c;
    total += c;
  }
  return {
    source: 'engineHist',
    lo: first - w / 2,
    hi: last + w / 2,
    binWidth: w,
    counts,
    total,
    underflow: 0,
    overflow: 0,
  };
}

/** Rebin `allValues` when present, else fall back to the engine's `hist` (which ignores `opts`). */
export function distributionHistogram(dist: DistributionMetrics, opts: HistogramOptions = {}): Histogram {
  return dist.allValues.length > 0 ? histogram(dist.allValues, opts) : engineHistogram(dist);
}
