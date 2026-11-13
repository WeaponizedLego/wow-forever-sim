import { runConcurrentStatWeights } from './statWeights';
import type { EngineClient, EngineVersion, RunOptions } from '@fsim/contracts';
import {
  ComputeStatsRequest,
  ComputeStatsResult,
  ErrorOutcomeType,
  ProgressMetrics,
  RaidSimRequest,
  RaidSimRequestSplitRequest,
  RaidSimRequestSplitResult,
  RaidSimResult,
  RaidSimResultCombinationRequest,
  StatWeightsRequest,
  StatWeightsResult,
  type ErrorOutcome,
} from '@fsim/proto/api';
import type { EngineAssets } from './loader';
import { EngineError, WorkerPool, abortReason, type WorkerFactory } from './pool';

/** Default upper bound on workers: each one holds its own ~32 MB module instance and Go heap. */
export const DEFAULT_MAX_CONCURRENCY = 8;

export interface EngineClientOptions {
  assets: EngineAssets | Promise<EngineAssets>;
  version: EngineVersion;
  createWorker: WorkerFactory;
  /** Number of workers. Defaults to the machine's logical cores, capped at `maxConcurrency`. */
  concurrency?: number;
  maxConcurrency?: number;
  /** Detected core count, supplied by the browser / Node entry. */
  hardwareConcurrency?: number;
  /** Forward the engine's Go log output to the console (default true). */
  engineLogs?: boolean;
}

let requestCounter = 0;
const newRequestId = (kind: string) => `${kind}-${++requestCounter}-${crypto.randomUUID().slice(0, 8)}`;

function outcomeError(err: ErrorOutcome, signal: AbortSignal | undefined): unknown {
  if (err.type === ErrorOutcomeType.ErrorOutcomeAborted) return abortReason(signal);
  return new EngineError(err.message || 'The engine reported an error.');
}

/** An abort controller that follows `parent` and can also be aborted on its own. */
function childController(parent: AbortSignal | undefined): AbortController {
  const ctl = new AbortController();
  if (parent) {
    if (parent.aborted) ctl.abort(parent.reason);
    else parent.addEventListener('abort', () => ctl.abort(parent.reason), { once: true });
  }
  return ctl;
}

/**
 * EngineClient on a pool of WASM workers.
 *
 * - `raidSim` splits the request across the workers with the engine's own `raidSimRequestSplit`,
 *   runs the splits with `raidSimAsync` in parallel and merges them with `raidSimResultCombination`.
 * - `statWeights` runs `statWeightsAsync` on one worker.
 * - Errors: an engine `ErrorOutcome` rejects with `EngineError`; an abort rejects with the signal's
 *   reason (a DOMException named AbortError by default).
 */
export class WasmEngineClient implements EngineClient {
  readonly version: EngineVersion;
  readonly concurrency: number;
  private readonly pool: WorkerPool;

  constructor(opts: EngineClientOptions) {
    this.version = opts.version;
    const max = opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.concurrency = Math.max(
      1,
      Math.floor(opts.concurrency ?? Math.min(opts.hardwareConcurrency ?? 1, max)),
    );
    this.pool = new WorkerPool({
      assets: Promise.resolve(opts.assets),
      factory: opts.createWorker,
      size: this.concurrency,
      engineLogs: opts.engineLogs ?? true,
    });
  }

  async raidSim(req: RaidSimRequest, opts: RunOptions = {}): Promise<RaidSimResult> {
    const { signal, onProgress } = opts;
    signal?.throwIfAborted();
    const totalIterations = req.simOptions?.iterations ?? 0;
    // The engine sims one iteration and reports a zero result for 0; the splitter rejects it. Be consistent.
    if (totalIterations <= 0) throw new EngineError('simOptions.iterations must be at least 1.');
    const parentId = req.requestId || newRequestId('raidSim');
    const splitCount = Math.min(this.concurrency, Math.max(1, totalIterations));

    let requests: RaidSimRequest[];
    if (splitCount <= 1) {
      requests = [{ ...req, requestId: parentId }];
    } else {
      const split = RaidSimRequestSplitResult.fromBinary(
        await this.pool.call(
          'raidSimRequestSplit',
          RaidSimRequestSplitRequest.toBinary({ splitCount, request: req }),
          {
            signal,
          },
        ),
      );
      if (split.errorResult) throw new EngineError(split.errorResult);
      // A worker keys running sims by request id, so every split needs its own.
      requests = split.requests.map((r, i) => ({ ...r, requestId: `${parentId}-${i}` }));
    }

    // Aggregate progress across splits: iterations summed, DPS/HPS weighted by iterations done.
    const done = requests.map(() => ({ iterations: 0, dps: 0, hps: 0 }));
    const report = () => {
      let iterations = 0;
      let dps = 0;
      let hps = 0;
      for (const d of done) {
        iterations += d.iterations;
        dps += d.dps * d.iterations;
        hps += d.hps * d.iterations;
      }
      onProgress?.(
        ProgressMetrics.create({
          totalIterations,
          completedIterations: iterations,
          dps: iterations ? dps / iterations : 0,
          hps: iterations ? hps / iterations : 0,
        }),
      );
    };

    const ctl = childController(signal);
    const results = await Promise.all(
      requests.map(async (r, i) => {
        const final = await this.pool.callAsync('raidSimAsync', RaidSimRequest.toBinary(r), r.requestId, {
          signal: ctl.signal,
          onProgress: (pm) => {
            done[i] = { iterations: pm.completedIterations, dps: pm.dps, hps: pm.hps };
            report();
          },
        });
        const res = final.finalRaidResult!;
        if (res.error) {
          const err = outcomeError(res.error, signal);
          ctl.abort(err); // stop the other splits
          throw err;
        }
        return res;
      }),
    ).catch((e: unknown) => {
      ctl.abort(e);
      throw signal?.aborted ? abortReason(signal) : e;
    });

    let result: RaidSimResult;
    if (results.length === 1) {
      result = results[0]!;
    } else {
      result = RaidSimResult.fromBinary(
        await this.pool.call(
          'raidSimResultCombination',
          RaidSimResultCombinationRequest.toBinary({ results, debug: req.simOptions?.debug ?? false }),
          { signal },
        ),
      );
      if (result.error) throw outcomeError(result.error, signal);
    }

    // create() deep-copies its input; attach the (large) result afterwards so listeners get the same object.
    const final = ProgressMetrics.create({
      totalIterations,
      completedIterations: result.iterationsDone,
      dps: result.raidMetrics?.dps?.avg ?? 0,
      hps: result.raidMetrics?.hps?.avg ?? 0,
    });
    final.finalRaidResult = result;
    onProgress?.(final);
    return result;
  }

  /**
   * Stat weights split across every worker, with paired seeds; with `req.target` set, runs are topped up until each
   * EP reaches the target ± (see ./statWeights.ts). Progress is iterations over all sims of all passes.
   */
  async statWeights(req: StatWeightsRequest, opts: RunOptions = {}): Promise<StatWeightsResult> {
    opts.signal?.throwIfAborted();
    const res = await runConcurrentStatWeights(
      {
        call: (method, payload, signal) => this.pool.call(method, payload, signal ? { signal } : {}),
        raidSim: (r, o) => this.raidSim(r, o),
      },
      req,
      opts,
    ).catch((e: unknown) => {
      throw opts.signal?.aborted ? abortReason(opts.signal) : e;
    });
    if (res.error) throw outcomeError(res.error, opts.signal);
    return res;
  }

  /** Stat weights on a single worker (`statWeightsAsync`), one pass. Kept for comparison and tests. */
  async statWeightsSingleWorker(req: StatWeightsRequest, opts: RunOptions = {}): Promise<StatWeightsResult> {
    const { signal, onProgress } = opts;
    signal?.throwIfAborted();
    const final = await this.pool.callAsync(
      'statWeightsAsync',
      StatWeightsRequest.toBinary(req),
      newRequestId('statWeights'),
      { signal, onProgress },
    );
    const res = final.finalWeightResult!;
    if (res.error) throw outcomeError(res.error, signal);
    onProgress?.(final);
    return res;
  }

  /** Character sheet stats (not part of the EngineClient contract yet). */
  async computeStats(
    req: ComputeStatsRequest,
    opts: { signal?: AbortSignal } = {},
  ): Promise<ComputeStatsResult> {
    const res = ComputeStatsResult.fromBinary(
      await this.pool.call('computeStats', ComputeStatsRequest.toBinary(req), { signal: opts.signal }),
    );
    if (res.errorResult) throw new EngineError(res.errorResult);
    return res;
  }

  dispose(): void {
    this.pool.dispose();
  }
}
