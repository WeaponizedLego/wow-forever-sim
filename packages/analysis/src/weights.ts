import type { StatWeightsResult, StatWeightValues } from '@fsim/proto/api';
import type { PseudoStat, Stat, UnitStats } from '@fsim/proto/common';
import { Z95 } from './stats';

/** A stat the engine can weigh: a primary `Stat` or a `PseudoStat` (weapon DPS, school hit %, …). */
export type StatRef = { kind: 'stat'; stat: Stat } | { kind: 'pseudo'; stat: PseudoStat };

export function statRefKey(ref: StatRef): string {
  return `${ref.kind}:${ref.stat}`;
}

export type WeightMetric = 'dps' | 'hps' | 'tps' | 'dtps' | 'tmi' | 'pDeath';

export interface StatWeightRow {
  ref: StatRef;
  /** Metric gained per 1 unit of the stat. */
  weight: number;
  /** Standard error of `weight`: the engine's per-sample stdev over √samples. */
  stdev: number;
  /** CI95 half-width of `weight` (Z95 · stdev). */
  ci95: number;
  /** Weight relative to the EP reference stat (reference = 1). */
  ep: number;
  /** Standard error of `ep`. */
  epStdev: number;
  /** stdev / |weight|. Null when the weight is 0. */
  relError: number | null;
  /** Paired samples behind the weight (`sampleCounts`, else the run's iterations); 0 for a stat not weighed. */
  samples: number;
  /** The engine's `weightsStdev` as reported: the stdev of one paired sample, not of the weight. */
  sampleStdev: number;
}

function read(stats: UnitStats | undefined, ref: StatRef): number {
  const arr = ref.kind === 'stat' ? stats?.stats : stats?.pseudoStats;
  return arr?.[ref.stat] ?? 0;
}

/**
 * Stat weight rows for the requested stats, in the order given.
 *
 * The engine's `weightsStdev` / `epValuesStdev` are the spread of ONE paired sample (sim/core/statweight.go
 * `meanAndStdDev` over the per-iteration differences), so the weight's standard error is that over √samples, where
 * samples is `sampleCounts` for the stat (upstream's UI does the same). `iterations` is the fallback for results without
 * per-stat counts.
 */
export function statWeightRows(
  result: StatWeightsResult,
  stats: readonly StatRef[],
  metric: WeightMetric = 'dps',
  iterations?: number,
): StatWeightRow[] {
  const v: StatWeightValues | undefined = result[metric];
  return stats.map((ref) => {
    const weight = read(v?.weights, ref);
    const sampleStdev = read(v?.weightsStdev, ref);
    const samples = (result.sampleCounts && read(result.sampleCounts, ref)) || iterations || 0;
    // A stat that was not weighed has no samples and no spread: its weight is 0 with no error.
    const root = samples > 0 ? Math.sqrt(samples) : NaN;
    const stdev = sampleStdev === 0 ? 0 : sampleStdev / root;
    return {
      ref,
      weight,
      stdev,
      ci95: Z95 * stdev,
      ep: read(v?.epValues, ref),
      epStdev: read(v?.epValuesStdev, ref) === 0 ? 0 : read(v?.epValuesStdev, ref) / root,
      relError: weight === 0 ? null : stdev / Math.abs(weight),
      samples,
      sampleStdev,
    };
  });
}

export interface StatDelta {
  ref: StatRef;
  /** Change in the stat, in its own unit (rating points, %, weapon DPS, …). */
  amount: number;
}

export interface LinearEstimate {
  /** Σ amountᵢ · weightᵢ. */
  delta: number;
  /** √Σ (amountᵢ · stdevᵢ)², assuming the weights' errors are independent. */
  stdev: number;
  /** CI95 half-width of `delta`. */
  ci95: number;
  terms: { ref: StatRef; amount: number; contribution: number; stdev: number }[];
  /** Stats with a non-zero delta but no weight row; they contribute nothing to the estimate. */
  missing: StatRef[];
}

/**
 * Linear estimate of the metric change for a gear change from stat weights.
 *
 * Error propagation ASSUMES each weight's error is independent: stdev = √Σ(amountᵢ·stdevᵢ)². The
 * engine's weight runs share random seeds, so their errors can be correlated; when they are
 * positively correlated the true ± is larger for changes that raise several stats together and
 * smaller for trades (one stat up, another down). Set bonuses, procs and caps are outside a linear
 * model: only a sim is exact.
 */
export function linearEstimate(
  deltas: readonly StatDelta[],
  weights: readonly StatWeightRow[],
): LinearEstimate {
  const byKey = new Map(weights.map((w) => [statRefKey(w.ref), w]));
  const terms: LinearEstimate['terms'] = [];
  const missing: StatRef[] = [];
  let delta = 0;
  let variance = 0;
  for (const d of deltas) {
    if (d.amount === 0) continue;
    const w = byKey.get(statRefKey(d.ref));
    if (!w) {
      missing.push(d.ref);
      continue;
    }
    const contribution = d.amount * w.weight;
    const sd = Math.abs(d.amount) * w.stdev;
    delta += contribution;
    variance += sd * sd;
    terms.push({ ref: d.ref, amount: d.amount, contribution, stdev: sd });
  }
  const stdev = Math.sqrt(variance);
  return { delta, stdev, ci95: Z95 * stdev, terms, missing };
}
