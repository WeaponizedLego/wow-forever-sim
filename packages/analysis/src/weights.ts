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
  /** Standard error of `weight`, as the engine reports it (`weightsStdev`). */
  stdev: number;
  /** CI95 half-width of `weight` (Z95 · stdev). */
  ci95: number;
  /** Weight relative to the EP reference stat (reference = 1). */
  ep: number;
  epStdev: number;
  /** stdev / |weight|. Null when the weight is 0. */
  relError: number | null;
  /** Paired samples behind the weight, when the engine reports it. */
  samples: number | null;
}

function read(stats: UnitStats | undefined, ref: StatRef): number {
  const arr = ref.kind === 'stat' ? stats?.stats : stats?.pseudoStats;
  return arr?.[ref.stat] ?? 0;
}

/**
 * Stat weight rows for the requested stats, in the order given.
 *
 * Assumes `weightsStdev` is the standard error of each weight (the engine derives it from the
 * per-iteration DPS spread of the paired runs over √samples), so CI95 = 1.96 · stdev.
 */
export function statWeightRows(
  result: StatWeightsResult,
  stats: readonly StatRef[],
  metric: WeightMetric = 'dps',
): StatWeightRow[] {
  const v: StatWeightValues | undefined = result[metric];
  return stats.map((ref) => {
    const weight = read(v?.weights, ref);
    const stdev = read(v?.weightsStdev, ref);
    const samples = result.sampleCounts ? read(result.sampleCounts, ref) : null;
    return {
      ref,
      weight,
      stdev,
      ci95: Z95 * stdev,
      ep: read(v?.epValues, ref),
      epStdev: read(v?.epValuesStdev, ref),
      relError: weight === 0 ? null : stdev / Math.abs(weight),
      samples,
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
