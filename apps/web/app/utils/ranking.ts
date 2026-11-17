// Ranking a batch of gear combinations (top gear, droptimizer) against the equipped set. Pure, so unit-tested.
//
// A batch has a quick pass at the batch's iterations and, optionally, a re-run of the best few (and the
// equipped set) at many more. Every row is judged against the equipped set *of its own pass*: a re-run row
// against the re-run equipped set, a row that was not re-run against the quick-pass equipped set. Testing a
// 250-iteration row against a 10k equipped mean would mix two noise levels and two random streams.
import { noiseFloor, welchTTest, type Verdict as WelchVerdict } from '@fsim/analysis';
import type { ItemSlotId } from '@fsim/contracts';
import type { Verdict } from '~/composables/ui-types';

export interface GearChange {
  slot: ItemSlotId;
  itemId: number;
}

export interface Combo {
  /** "" for the equipped set, else "slot:item|slot:item". */
  key: string;
  changes: GearChange[];
}

export interface ComboResult extends Combo {
  mean: number;
  stdev: number;
  n: number;
  ci95: number;
}

export interface RankedRow extends ComboResult {
  rank: number;
  equipped: boolean;
  /** Against the equipped set simmed at the row's own iterations. */
  delta: number;
  /** z·√(se² + se_ref²): |Δ| below this is within noise. */
  noise: number;
  p: number | null;
  verdict: Verdict;
  /** Simmed again at more iterations than the batch's quick pass. */
  rerun: boolean;
  /** The quick-pass Δ: a re-run row's stored first pass, else `delta`. */
  quickDelta: number;
}

const VERDICT: Record<WelchVerdict, Verdict> = { better: 'up', worse: 'down', noise: 'noise' };

/**
 * Results sorted by Δ, each tested (Welch, with the noise floor) against the equipped set at its own
 * iterations. `quick` holds the first-pass results a re-run replaced (the equipped set under ''), and
 * `baseIterations` is the quick pass's iteration count; without them every row is one pass against `ref`.
 */
export function rankResults(
  results: Record<string, ComboResult>,
  ref: ComboResult,
  opts: { refKey?: string; quick?: Record<string, ComboResult>; baseIterations?: number } = {},
): RankedRow[] {
  const refKey = opts.refKey ?? '';
  const quick = opts.quick ?? {};
  const base = opts.baseIterations ?? ref.n;
  // The equipped set's quick pass: its stored first pass when it was re-run, else the current result.
  const quickRef = quick[refKey] ?? ref;
  return Object.values(results)
    .map((r) => {
      const equipped = r.key === refKey;
      const rerun = !equipped && r.n !== base;
      // Same iterations as the row, so both sides of the test carry the same noise.
      const against = r.n === ref.n || r.n !== quickRef.n ? ref : quickRef;
      const noise = noiseFloor(r, against);
      let verdict: Verdict = 'reference';
      let p: number | null = null;
      if (!equipped && r.n >= 2 && against.n >= 2) {
        const w = welchTTest(r, against, { minDelta: noise });
        p = w.p;
        verdict = VERDICT[w.verdict];
      }
      const delta = equipped ? 0 : r.mean - against.mean;
      const quickDelta = rerun && quick[r.key] ? quick[r.key]!.mean - quickRef.mean : delta;
      return { ...r, rank: 0, equipped, delta, noise, p, verdict, rerun, quickDelta };
    })
    .sort((x, y) => y.delta - x.delta || y.mean - x.mean)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * The typical noise floor of each pass (the median over its rows), for the page header and the ranking note:
 * |Δ| below it is within noise. `final` is null until a row was re-run.
 */
export function passNoiseFloors(rows: readonly RankedRow[]): {
  quick: number | null;
  final: { n: number; noise: number } | null;
} {
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const quickRows = rows.filter((r) => !r.equipped && !r.rerun);
  const rerunRows = rows.filter((r) => r.rerun);
  const finalNoise = median(rerunRows.map((r) => r.noise));
  return {
    quick: median(quickRows.map((r) => r.noise)),
    final: finalNoise === null ? null : { n: rerunRows[0]!.n, noise: finalNoise },
  };
}

/**
 * The header's noise floor, per pass: "±3.8 at 250 it" before a re-run, "±3.8 at 250 it · ±0.9 at 10k"
 * after one. Null with nothing ranked.
 */
export function noiseFloorText(rows: readonly RankedRow[], baseIterations: number): string | null {
  const f = passNoiseFloors(rows);
  const parts = [
    ...(f.quick === null ? [] : [`±${f.quick.toFixed(1)} at ${iterationsLabel(baseIterations)} it`]),
    ...(f.final ? [`±${f.final.noise.toFixed(1)} at ${iterationsLabel(f.final.n)}`] : []),
  ];
  return parts.length ? parts.join(' · ') : null;
}

/** "10k", "25k", "500". */
export function iterationsLabel(n: number): string {
  return n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n);
}
