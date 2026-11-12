// Hit scaling for a run: the run's character simmed at several hit chances (1,000 iterations each, the
// run's seed), on request only. Hit chance on the x axis is what the engine's character sheet
// (computeStats) reports for each point, not a rating conversion of ours.
import { summarize } from '@fsim/analysis';
import { Stat } from '@fsim/proto/common';
import type { RunEntry } from './session';

export interface HitScalingPoint {
  /** Bonus hit rating added for this point. */
  rating: number;
  /** Hit chance in %, from the engine's character sheet. */
  hit: number;
  mean: number;
  ci95: number;
}

export interface HitScalingState {
  status: 'running' | 'done' | 'error' | 'cancelled';
  label: string;
  points: HitScalingPoint[];
  /** The run's own hit chance (bonus 0). */
  current: number | null;
  iterations: number;
  total: number;
  /** 0–1 across all points. */
  progress: number;
  error?: string;
}

export const HIT_SCALING_ITERATIONS = 1000;
/** Steps in % of hit chance around the current value; points below 0% hit are skipped. */
const STEPS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const MAX_POINTS = 9;

const states = reactive(new Map<string, HitScalingState>());
const aborts = new Map<string, AbortController>();

export function useHitScaling() {
  function state(runId: string): HitScalingState | null {
    return states.get(runId) ?? null;
  }

  async function run(entry: RunEntry) {
    const id = entry.record.id;
    aborts.get(id)?.abort();
    const ctl = new AbortController();
    aborts.set(id, ctl);
    const c = entry.record.character;
    const { stat: hitStat, label } = hitPseudoStat(c.spec);
    const s: HitScalingState = reactive({
      status: 'running',
      label,
      points: [],
      current: null,
      iterations: HIT_SCALING_ITERATIONS,
      total: 0,
      progress: 0,
    });
    states.set(id, s);
    const hitAt = async (rating: number) =>
      (await computeFinalStats(c, { bonusStats: { [Stat.StatHitRating]: rating }, signal: ctl.signal }))
        ?.pseudoStats[hitStat] ?? 0;
    try {
      // Rating per 1% hit, measured on the engine's character sheet.
      const probe = 100;
      const [h0, h1] = [await hitAt(0), await hitAt(probe)];
      if (!(h1 > h0)) throw new Error('Hit rating does not change hit chance for this character.');
      const perPercent = probe / (h1 - h0);
      s.current = h0;
      const steps = STEPS.filter((k) => h0 + k >= -1e-9).slice(0, MAX_POINTS);
      s.total = steps.length;
      for (const [i, k] of steps.entries()) {
        const rating = Math.round(k * perPercent * 100) / 100;
        const hit = k === 0 ? h0 : await hitAt(rating);
        const result = await simVariant(c, {
          iterations: HIT_SCALING_ITERATIONS,
          seed: entry.record.seed,
          bonusStats: { [Stat.StatHitRating]: rating },
          signal: ctl.signal,
          onProgress: (f) => (s.progress = (i + f) / steps.length),
        });
        const sum = summarize(result.raidMetrics!.dps!, result.iterationsDone);
        s.points.push({ rating, hit, mean: sum.mean, ci95: sum.ci95 });
        s.progress = (i + 1) / steps.length;
      }
      s.status = 'done';
    } catch (e) {
      if (ctl.signal.aborted) s.status = 'cancelled';
      else {
        s.status = 'error';
        s.error = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (aborts.get(id) === ctl) aborts.delete(id);
    }
  }

  function cancel(runId: string) {
    aborts.get(runId)?.abort();
  }

  return { state, run, cancel };
}
