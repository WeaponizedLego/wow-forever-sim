// End-to-end: the real engine WASM (packages/engine/vendor/) in worker_threads.
import { ProgressMetrics, RaidSimRequest, type RaidSimResult } from '@fsim/proto/api';
import { availableParallelism } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WasmEngineClient } from './client';
import { createVendorEngineClient } from './node';
import {
  FIXTURE_DPS,
  VENDOR_MISSING,
  loadRaidSimRequest,
  loadRaidSimResult,
  loadStatWeightsRequest,
} from './testing/fixtures';

if (VENDOR_MISSING) console.warn(VENDOR_MISSING);

const N = Math.min(availableParallelism(), 8);
const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t0 = performance.now();
  const out = await fn();
  return [out, Math.round(performance.now() - t0)];
};

describe.skipIf(!!VENDOR_MISSING)('engine in worker_threads', () => {
  let one: WasmEngineClient;
  let many: WasmEngineClient;
  const fixtureReq = loadRaidSimRequest();
  const fixtureRes = loadRaidSimResult();
  const timings: Record<string, number> = {};
  let single: RaidSimResult;

  beforeAll(() => {
    one = createVendorEngineClient({ concurrency: 1, engineLogs: false });
    many = createVendorEngineClient({ concurrency: N, engineLogs: false });
  });
  afterAll(() => {
    one?.dispose();
    many?.dispose();
    console.log(`[engine timing] 5,000 iterations: ${JSON.stringify(timings)} (N=${N})`);
  });

  it('matches the fixture exactly on one worker', async () => {
    // First call includes worker start-up (instantiate + Go init).
    [single, timings['1 worker (cold)']] = await timed(() => one.raidSim(fixtureReq));
    const dps = single.raidMetrics!.dps!;
    expect(dps.avg).toBe(FIXTURE_DPS);
    expect(dps.stdev).toBe(fixtureRes.raidMetrics!.dps!.stdev);
    expect(dps.allValues).toEqual(fixtureRes.raidMetrics!.dps!.allValues);
    expect(single.logs).toBe(fixtureRes.logs);
    expect(single.iterationsDone).toBe(5000);
  });

  it('splits across N workers: same iterations, allValues, logs and hist; mean within CI', async () => {
    const progress: ProgressMetrics[] = [];
    await many.raidSim(fixtureReq); // warm the workers so the timing below is the sim alone
    let res: RaidSimResult;
    [res, timings[`${N} workers`]] = await timed(() =>
      many.raidSim(fixtureReq, { onProgress: (p) => progress.push(p) }),
    );
    [, timings['1 worker (warm)']] = await timed(() => one.raidSim(fixtureReq));

    const dps = res.raidMetrics!.dps!;
    const ref = single.raidMetrics!.dps!;
    expect(res.iterationsDone).toBe(5000);
    // Each split starts at the seed its iterations had in the single run, so per-iteration values are identical...
    expect(dps.allValues).toEqual(ref.allValues);
    expect(Object.values(dps.hist).reduce((a, b) => a + b, 0)).toBe(5000);
    expect(dps.hist).toEqual(ref.hist);
    // ...and iteration 1's log comes from the first split.
    expect(res.logs).toBe(single.logs);
    // The mean is a weighted sum of split means, so it may differ from the single run in the last bits.
    console.log(
      `[engine split] ${N} workers: mean ${dps.avg} (Δ ${dps.avg - FIXTURE_DPS}), stdev ${dps.stdev}`,
    );
    expect(Math.abs(dps.avg - FIXTURE_DPS)).toBeLessThan(1e-6);
    expect(Math.abs(dps.avg - FIXTURE_DPS)).toBeLessThan((1.96 * ref.stdev) / Math.sqrt(5000));
    expect(dps.stdev).toBeCloseTo(ref.stdev, 6);

    // Progress: aggregated across workers, monotonic, ends with the final result.
    expect(progress.length).toBeGreaterThan(1);
    const done = progress.map((p) => p.completedIterations);
    expect(done).toEqual([...done].sort((a, b) => a - b));
    expect(progress.at(-1)!.finalRaidResult).toBe(res);
    expect(progress.every((p) => p.totalIterations === 5000)).toBe(true);
  });

  it('is deterministic for the same request, seed and worker count', async () => {
    const [a, b] = await Promise.all([many.raidSim(fixtureReq), many.raidSim(fixtureReq)]);
    expect(a.raidMetrics!.dps!.avg).toBe(b.raidMetrics!.dps!.avg);
    expect(a.raidMetrics!.dps!.allValues).toEqual(b.raidMetrics!.dps!.allValues);
  });

  it('aborts a running sim and keeps the pool usable', async () => {
    const ctl = new AbortController();
    const big = { ...fixtureReq, simOptions: { ...fixtureReq.simOptions!, iterations: 200_000 } };
    let progressEvents = 0;
    const t0 = performance.now();
    const run = many.raidSim(big, {
      signal: ctl.signal,
      onProgress: () => {
        if (++progressEvents === 3) ctl.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    timings['abort latency incl. start'] = Math.round(performance.now() - t0);
    // Workers must actually have stopped: the next sim runs at normal speed and is correct.
    const [after, ms] = await timed(() => many.raidSim(fixtureReq));
    timings['sim after abort'] = ms;
    expect(Math.abs(after.raidMetrics!.dps!.avg - FIXTURE_DPS)).toBeLessThan(1e-6);
  });

  it('rejects immediately with an already-aborted signal', async () => {
    await expect(one.raidSim(fixtureReq, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('returns stat weights with stdev', async () => {
    const req = loadStatWeightsRequest();
    req.simOptions = { ...req.simOptions!, iterations: 400 };
    const progress: ProgressMetrics[] = [];
    let res;
    [res, timings['statWeights 400 it']] = await timed(() =>
      one.statWeights(req, { onProgress: (p) => progress.push(p) }),
    );
    const w = res.dps!;
    // Agility (1) and ranged attack power (15, the EP reference).
    expect(w.weights!.stats[1]).toBeGreaterThan(0);
    expect(w.weightsStdev!.stats[1]).toBeGreaterThan(0);
    expect(w.epValues!.stats[15]).toBe(1);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)!.finalWeightResult).toBeDefined();
  });

  it('parallel stat weights match the single-worker engine exactly', async () => {
    const req = loadStatWeightsRequest();
    req.simOptions = { ...req.simOptions!, iterations: 400 };
    const [single1] = await timed(() => one.statWeightsSingleWorker(req));
    const progress: ProgressMetrics[] = [];
    let par;
    [par, timings['statWeights 400 it, parallel']] = await timed(() =>
      many.statWeights(req, { onProgress: (p) => progress.push(p) }),
    );
    expect(par.dps!.weights!.stats).toEqual(single1.dps!.weights!.stats);
    expect(par.dps!.weightsStdev!.stats).toEqual(single1.dps!.weightsStdev!.stats);
    expect(progress.at(-1)!.completedIterations).toBe(progress.at(-1)!.totalIterations);
  });

  it('tops up stat weight runs until a precision target is met', async () => {
    const req = loadStatWeightsRequest();
    const target = 0.25; // 90% ± of each EP, in EP units; loose so the test stays quick
    const res = await many.statWeights({
      ...req,
      target: { epCi: target, maxIterationMultiplier: 0, metrics: [] },
    });
    // Agility (1); the EP reference (ranged AP, 15) is exact by definition.
    const samples = res.sampleCounts!.stats[1]!;
    const se = res.dps!.epValuesStdev!.stats[1]! / Math.sqrt(samples);
    expect(1.6448536269514722 * se).toBeLessThanOrEqual(target * 1.0001);
  });

  it('reports engine errors as EngineError', async () => {
    const bad = { ...fixtureReq, simOptions: { ...fixtureReq.simOptions!, iterations: 0 } };
    await expect(many.raidSim(bad)).rejects.toMatchObject({ name: 'EngineError' });
    // A request the engine rejects itself: the splitter's error comes back as EngineError too.
    const noRaid = RaidSimRequest.clone(fixtureReq);
    delete noRaid.raid;
    await expect(many.raidSim(noRaid)).rejects.toMatchObject({ name: 'EngineError' });
  });
});
