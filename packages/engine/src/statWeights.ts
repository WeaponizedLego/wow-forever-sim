// Parallel stat weights with an optional precision target, ported from upstream wowsims/forever
// ui/sim/wasm/stat_weights.ts (runConcurrentStatWeights, MIT). Same algorithm, same order of operations:
//
// 1. `statWeightRequests` turns the request into a baseline sim plus a low/high sim per stat.
// 2. Every sim runs split across all workers (our `raidSim`).
// 3. Each stat run's iterations are paired with the baseline's iterations at the same seed; pairing cancels most of
//    the fight-to-fight noise, which is why this is far more precise per iteration than independent runs.
// 4. With `request.target`, `statWeightTopUpPlan` says how many more iterations each stat (and the baseline) needs to
//    reach the target ±; runs are continued at the seed after their last iteration until the plan is empty.
// 5. `statWeightCompute` turns the paired sums into weights, EPs and their stdevs.
import {
  ErrorOutcomeType,
  ProgressMetrics,
  RaidSimRequest,
  type RaidSimResult,
  StatWeightRequestsData,
  StatWeightsCalcRequest,
  StatWeightsPairedSums,
  StatWeightsRequest,
  StatWeightsResult,
  StatWeightsSidePairs,
  StatWeightsStatPairs,
  StatWeightsTopUpPlan,
  StatWeightsTopUpRequest,
} from '@fsim/proto/api';
import type { RunOptions } from '@fsim/contracts';

export interface StatWeightsDeps {
  /** A synchronous engine call on any worker. */
  call(
    method: 'statWeightRequests' | 'statWeightTopUpPlan' | 'statWeightCompute',
    payload: Uint8Array,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
  /** One sim split across the workers, with per-iteration values. */
  raidSim(req: RaidSimRequest, opts: RunOptions): Promise<RaidSimResult>;
}

const RUN_METRICS = ['dps', 'hps', 'threat', 'dtps', 'tmi'] as const;

const firstPlayer = (r: RaidSimResult) => r.raidMetrics!.parties[0]!.players[0]!;

const pushRunValues = (values: number[][], r: RaidSimResult) =>
  RUN_METRICS.forEach((metric, m) => {
    for (const v of firstPlayer(r)[metric]!.allValues) values[m]!.push(v);
  });

/** Pairs each iteration of a stat run with the baseline's iteration offset + i (same seed). */
function pairRun(baseline: number[][], r: RaidSimResult, offset: number): StatWeightsSidePairs {
  const [dps, hps, tps, dtps, tmi] = RUN_METRICS.map((metric, m): StatWeightsPairedSums => {
    let i = 0;
    let total = 0;
    let sumSq = 0;
    for (const v of firstPlayer(r)[metric]!.allValues) {
      const diff = v - baseline[m]![offset + i++]!;
      total += diff;
      sumSq += diff * diff;
    }
    return StatWeightsPairedSums.create({ n: i, sum: total, sumSq });
  });
  return StatWeightsSidePairs.create({
    dps: dps!,
    hps: hps!,
    tps: tps!,
    dtps: dtps!,
    tmi: tmi!,
    chanceOfDeath: firstPlayer(r).chanceOfDeath,
  });
}

/** Adds a later pass's pairs to a side's. The chance of death stays the first run's. */
function addPairs(side: StatWeightsSidePairs, pass: StatWeightsSidePairs) {
  for (const metric of ['dps', 'hps', 'tps', 'dtps', 'tmi'] as const) {
    side[metric]!.n += pass[metric]!.n;
    side[metric]!.sum += pass[metric]!.sum;
    side[metric]!.sumSq += pass[metric]!.sumSq;
  }
}

export async function runConcurrentStatWeights(
  deps: StatWeightsDeps,
  request: StatWeightsRequest,
  opts: RunOptions = {},
): Promise<StatWeightsResult> {
  const { signal, onProgress } = opts;
  let reqSeq = 0;
  const reqId = () => `sw-${Date.now().toString(36)}-${reqSeq++}`;

  const manual = StatWeightRequestsData.fromBinary(
    await deps.call('statWeightRequests', StatWeightsRequest.toBinary(request), signal),
  );
  const base = manual.baseRequest!;

  // Progress over every sim of every pass; totals grow as top-up passes are planned.
  let iterationsTotal = base.simOptions!.iterations;
  let iterationsDone = 0;
  for (const s of manual.statSimRequests) {
    if (s.requestLow) iterationsTotal += s.requestLow.simOptions!.iterations;
    iterationsTotal += s.requestHigh!.simOptions!.iterations;
  }
  const report = () =>
    onProgress?.(
      ProgressMetrics.create({ totalIterations: iterationsTotal, completedIterations: iterationsDone }),
    );

  const sim = async (req: RaidSimRequest): Promise<RaidSimResult> => {
    let last = 0;
    const res = await deps.raidSim(
      {
        ...req,
        requestId: reqId(),
        simOptions: { ...req.simOptions!, saveAllValues: true, debugFirstIteration: false, debug: false },
      },
      {
        ...(signal && { signal }),
        onProgress: (pm) => {
          iterationsDone += pm.completedIterations - last;
          last = pm.completedIterations;
          report();
        },
      },
    );
    return res;
  };

  // 1. Baseline. Only its per-iteration values are kept, for the stat runs of later passes to pair with.
  const baselineValues: number[][] = RUN_METRICS.map(() => []);
  const baseResult = await sim(base);
  pushRunValues(baselineValues, baseResult);

  const calc = StatWeightsCalcRequest.create({
    epReferenceStat: manual.epReferenceStat,
    hpsReferenceStat: manual.hpsReferenceStat,
    probeIterations: baselineValues[0]!.length,
    baselineIterations: baselineValues[0]!.length,
    baseChanceOfDeath: firstPlayer(baseResult).chanceOfDeath,
  });
  const statPairs = new Map<number, StatWeightsStatPairs>();
  const statRequests = new Map(manual.statSimRequests.map((s) => [s.statData!.unitStat, s]));

  // 2. One low/high run per stat, all queued at once across the workers.
  await Promise.all(
    manual.statSimRequests.flatMap((s) => {
      const pairs = StatWeightsStatPairs.create({ statData: s.statData! });
      calc.statPairs.push(pairs);
      statPairs.set(s.statData!.unitStat, pairs);
      const runs = [sim(s.requestHigh!).then((r) => void (pairs.high = pairRun(baselineValues, r, 0)))];
      if (s.requestLow)
        runs.push(sim(s.requestLow).then((r) => void (pairs.low = pairRun(baselineValues, r, 0))));
      return runs;
    }),
  );

  // 3. Top up until every targeted EP reaches its ± (or the iteration cap stops it).
  if (request.target) {
    const seed = base.simOptions!.randomSeed;
    // Iteration i runs at seed + i, so a run continued at the seed after its last iteration repeats what one longer
    // run would have simulated.
    const continued = (r: RaidSimRequest, done: number, iterations: number): RaidSimRequest => ({
      ...r,
      simOptions: { ...r.simOptions!, iterations, randomSeed: seed + done },
    });

    for (let passes = 0; ; passes++) {
      const plan = StatWeightsTopUpPlan.fromBinary(
        await deps.call(
          'statWeightTopUpPlan',
          StatWeightsTopUpRequest.toBinary(
            StatWeightsTopUpRequest.create({ calc, target: request.target, passes }),
          ),
          signal,
        ),
      );
      if (plan.stats.length === 0) break;

      const baselineDelta = plan.baselineIterations - calc.baselineIterations;
      if (baselineDelta > 0) iterationsTotal += baselineDelta;
      for (const planned of plan.stats) {
        const runs = statRequests.get(planned.unitStat)!.requestLow ? 2 : 1;
        iterationsTotal += runs * (planned.iterations - statPairs.get(planned.unitStat)!.high!.dps!.n);
      }
      report();

      if (baselineDelta > 0) {
        pushRunValues(baselineValues, await sim(continued(base, calc.baselineIterations, baselineDelta)));
        calc.baselineIterations = baselineValues[0]!.length;
      }

      await Promise.all(
        plan.stats.flatMap((planned) => {
          const s = statRequests.get(planned.unitStat)!;
          const pairs = statPairs.get(planned.unitStat)!;
          const done = pairs.high!.dps!.n;
          const delta = planned.iterations - done;
          if (delta <= 0) return [];
          const runs = [
            sim(continued(s.requestHigh!, done, delta)).then((r) =>
              addPairs(pairs.high!, pairRun(baselineValues, r, done)),
            ),
          ];
          if (s.requestLow)
            runs.push(
              sim(continued(s.requestLow, done, delta)).then((r) =>
                addPairs(pairs.low!, pairRun(baselineValues, r, done)),
              ),
            );
          return runs;
        }),
      );
    }
  }

  // 4. Weights from the paired sums.
  const result = StatWeightsResult.fromBinary(
    await deps.call('statWeightCompute', StatWeightsCalcRequest.toBinary(calc), signal),
  );
  if (result.error && result.error.type !== ErrorOutcomeType.ErrorOutcomeAborted) return result;
  const final = ProgressMetrics.create({
    totalIterations: iterationsTotal,
    completedIterations: iterationsDone,
  });
  final.finalWeightResult = result;
  onProgress?.(final);
  return result;
}
