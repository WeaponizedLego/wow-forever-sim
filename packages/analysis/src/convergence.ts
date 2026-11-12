import { Z95 } from './stats';

export interface ConvergencePoint {
  /** Iterations included (the first n values). */
  n: number;
  /** Running mean of the first n values. */
  mean: number;
  /** CI95 half-width of that mean (Z95 · s / √n, s = population stdev of the first n values). */
  ci95: number;
}

export interface ConvergenceOptions {
  /** First checkpoint. Default 50 (or n if fewer values). */
  start?: number;
  /** Number of log-spaced checkpoints from `start` to n, inclusive. Default 60. */
  points?: number;
  /** Tolerance for the stability rule, as a fraction of the final mean. Default 0.0025 (±0.25%). */
  tolerance?: number;
}

export interface Convergence {
  points: ConvergencePoint[];
  /**
   * First checkpoint from which the run counts as stable, or null if it never does.
   *
   * Rule: checkpoint k is stable when, for k and every later checkpoint j,
   *   (a) the CI95 half-width at j is at most `tolerance · |final mean|`, and
   *   (b) the running mean at j is within `tolerance · |final mean|` of the final mean.
   * (a) says the estimate is precise enough, (b) that it has stopped drifting. Requiring every later
   * checkpoint, not just one, keeps a lucky early crossing from counting.
   */
  stableAfter: number | null;
  tolerance: number;
}

/** Log-spaced integer checkpoints from start to end inclusive, deduplicated. */
export function logCheckpoints(start: number, end: number, points: number): number[] {
  const s = Math.max(1, Math.min(start, end));
  if (points <= 1 || s === end) return [end];
  const out: number[] = [];
  const l0 = Math.log(s);
  const l1 = Math.log(end);
  for (let k = 0; k < points; k++) {
    const n = k === points - 1 ? end : Math.round(Math.exp(l0 + ((l1 - l0) * k) / (points - 1)));
    if (out.length === 0 || n > out[out.length - 1]!) out.push(n);
  }
  return out;
}

/** Running mean and CI95 of per-iteration values at log-spaced iteration counts. */
export function convergence(values: readonly number[], opts: ConvergenceOptions = {}): Convergence {
  const total = values.length;
  const tolerance = opts.tolerance ?? 0.0025;
  if (total === 0) return { points: [], stableAfter: null, tolerance };
  const checkpoints = logCheckpoints(opts.start ?? 50, total, opts.points ?? 60);

  // Welford's running mean / sum of squared deviations.
  const points: ConvergencePoint[] = [];
  let mean = 0;
  let m2 = 0;
  let next = 0;
  for (let i = 0; i < total && next < checkpoints.length; i++) {
    const x = values[i]!;
    const n = i + 1;
    const d = x - mean;
    mean += d / n;
    m2 += d * (x - mean);
    if (n === checkpoints[next]) {
      points.push({ n, mean, ci95: (Z95 * Math.sqrt(m2 / n)) / Math.sqrt(n) });
      next++;
    }
  }

  const final = points[points.length - 1]!.mean;
  const tol = tolerance * Math.abs(final);
  let stableAfter: number | null = null;
  for (let k = points.length - 1; k >= 0; k--) {
    const p = points[k]!;
    if (p.ci95 <= tol && Math.abs(p.mean - final) <= tol) stableAfter = p.n;
    else break;
  }
  return { points, stableAfter, tolerance };
}
