import { Z95 } from './stats';

// ---------------------------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (Lanczos, g = 7, n = 9; ~15 significant digits). */
export function lnGamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (modified Lentz, Numerical Recipes `betacf`). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  const EPS = 1e-15;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b), for a, b > 0 and 0 ≤ x ≤ 1. */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (!(a > 0 && b > 0)) throw new Error('regularizedIncompleteBeta: a and b must be > 0');
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const front = Math.exp(lnFront);
  // The continued fraction converges fast for x < (a+1)/(a+b+2); use the symmetry otherwise.
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Student-t CDF P(T ≤ t) with `df` degrees of freedom (df may be fractional; Infinity → normal). */
export function studentTCdf(t: number, df: number): number {
  if (!(df > 0)) throw new Error('studentTCdf: df must be > 0');
  if (Number.isNaN(t)) return NaN;
  if (!Number.isFinite(df)) return normalCdf(t);
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const tail = 0.5 * regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Two-sided p-value P(|T| ≥ |t|). */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(df)) return 2 * (1 - normalCdf(Math.abs(t)));
  if (!Number.isFinite(t)) return 0;
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Standard normal CDF (absolute error < 1e-7; only used for df = Infinity). */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

const ERFC_COEFFS = [
  -1.26551223, 1.00002368, 0.37409196, 0.09678418, -0.18628806, 0.27886807, -1.13520398, 1.48851587,
  -0.82215223, 0.17087277,
];

/** Complementary error function; Numerical Recipes `erfcc` (|relative error| < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  let poly = 0;
  for (let i = ERFC_COEFFS.length - 1; i >= 0; i--) poly = ERFC_COEFFS[i]! + t * poly;
  const r = t * Math.exp(-z * z + poly);
  return x >= 0 ? r : 2 - r;
}

// ---------------------------------------------------------------------------------------------
// Two-run comparison
// ---------------------------------------------------------------------------------------------

/** What a run contributes to a comparison: its mean, per-iteration stdev and iteration count. */
export interface SampleStats {
  mean: number;
  stdev: number;
  n: number;
}

export type Verdict = 'better' | 'worse' | 'noise';

export interface WelchOptions {
  /** Significance level for the two-sided test. Default 0.05. */
  alpha?: number;
  /**
   * Smallest |Δ| that counts as a real change even when significant, in the metric's unit.
   * Default 0. Use `noiseFloor(a, b)` to reproduce the Top gear "within noise" band.
   */
  minDelta?: number;
  /** Default true (DPS). Set false for metrics where lower is better (DTPS, TMI). */
  higherIsBetter?: boolean;
}

export interface WelchResult {
  /** a.mean − b.mean (run minus baseline). */
  delta: number;
  /** Standard error of delta, √(se_a² + se_b²). */
  se: number;
  /** CI95 half-width of delta (Z95 · se). */
  ci95: number;
  t: number;
  /** Welch–Satterthwaite degrees of freedom. */
  df: number;
  /** Two-sided p-value. */
  p: number;
  verdict: Verdict;
}

/**
 * Welch's unequal-variance t-test of run `a` against baseline `b`.
 *
 * Verdict is `noise` when p > alpha or |Δ| < minDelta, else `better` / `worse` by the sign of Δ.
 * The stdevs are the engine's per-iteration stdevs; the engine divides by n rather than n − 1,
 * which at ≥ 100 iterations changes t by under 0.5%.
 */
export function welchTTest(a: SampleStats, b: SampleStats, opts: WelchOptions = {}): WelchResult {
  if (a.n < 2 || b.n < 2) throw new Error('welchTTest: each run needs n ≥ 2');
  const alpha = opts.alpha ?? 0.05;
  const minDelta = opts.minDelta ?? 0;
  const higherIsBetter = opts.higherIsBetter ?? true;
  const va = (a.stdev * a.stdev) / a.n;
  const vb = (b.stdev * b.stdev) / b.n;
  const se = Math.sqrt(va + vb);
  const delta = a.mean - b.mean;

  let t: number;
  let df: number;
  let p: number;
  if (se === 0) {
    t = delta === 0 ? 0 : delta > 0 ? Infinity : -Infinity;
    df = a.n + b.n - 2;
    p = delta === 0 ? 1 : 0;
  } else {
    t = delta / se;
    df = (va + vb) ** 2 / ((va * va) / (a.n - 1) + (vb * vb) / (b.n - 1));
    p = studentTTwoSidedP(t, df);
  }

  let verdict: Verdict = 'noise';
  if (p <= alpha && Math.abs(delta) >= minDelta && delta !== 0) {
    verdict = delta > 0 === higherIsBetter ? 'better' : 'worse';
  }
  return { delta, se, ci95: Z95 * se, t, df, p, verdict };
}

/**
 * The |Δ| below which two runs cannot be told apart at the given confidence:
 * z · √(se_a² + se_b²), with z = 1.96 for 95% (as in Top gear). Pass `z` for other levels.
 */
export function noiseFloor(a: SampleStats, b: SampleStats, z: number = Z95): number {
  return z * Math.sqrt((a.stdev * a.stdev) / a.n + (b.stdev * b.stdev) / b.n);
}
