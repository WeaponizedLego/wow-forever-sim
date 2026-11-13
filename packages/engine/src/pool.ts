// A fixed pool of engine workers. Each worker runs one job at a time (the Go runtime in a worker is
// single-threaded; two sims on one worker would just interleave), with a FIFO queue per worker.
//
// Abort terminates the worker running the job and starts a fresh one from the compiled module.
// The engine's own abortById cannot work here: a running sim never returns to the worker's event
// loop (its `time.Sleep(time.Microsecond)` "yield" expires before the Go scheduler goes idle, so no
// JS timer is ever scheduled), so the abort message would only be read after the sim has finished.
import { ProgressMetrics } from '@fsim/proto/api';
import type { EngineAssets } from './loader';
import type { AsyncMethod, HostMessage, SyncMethod, WorkerMessage } from './protocol';

/** The host side of a worker, whatever runs it (Web Worker, worker_threads). */
export interface WorkerLike {
  postMessage(msg: HostMessage, transfer?: ArrayBuffer[]): void;
  onMessage(handler: (msg: WorkerMessage) => void): void;
  /** Errors the worker cannot report itself (script failed to load, uncaught exception). */
  onError(handler: (err: Error) => void): void;
  terminate(): void;
}
export type WorkerFactory = (index: number) => WorkerLike;

/** A failure the engine reported (ErrorOutcome, a panic, a request that did not parse). */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export const abortReason = (signal: AbortSignal | undefined): unknown =>
  signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');

const transferable = (b: Uint8Array): ArrayBuffer[] =>
  b.buffer instanceof ArrayBuffer && b.byteOffset === 0 && b.byteLength === b.buffer.byteLength
    ? [b.buffer]
    : [];

const isFinal = (pm: ProgressMetrics) =>
  !!(pm.finalRaidResult || pm.finalWeightResult || pm.finalBulkSimResult || pm.finalReforgeResult);

interface Job {
  method: SyncMethod | AsyncMethod;
  payload: Uint8Array;
  requestId?: string;
  async: boolean;
  onProgress?: ((pm: ProgressMetrics) => void) | undefined;
  signal?: AbortSignal | undefined;
  /** Settles the caller's promise; later calls are no-ops. */
  settle: (ok: boolean, value: unknown) => void;
  settled: boolean;
  detachAbort?: () => void;
}

class Slot {
  worker: WorkerLike;
  ready = false;
  current: (Job & { id: number }) | undefined;
  readonly queue: Job[] = [];

  constructor(
    readonly index: number,
    private readonly pool: WorkerPool,
  ) {
    this.worker = this.spawn();
  }

  get load(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  spawn(): WorkerLike {
    const w = this.pool.factory(this.index);
    this.ready = false;
    w.onMessage((m) => this.onMessage(m));
    w.onError((e) => this.crash(`engine worker ${this.index} failed: ${e.message}`));
    this.pool.assets.then(
      (a) =>
        w.postMessage({
          type: 'init',
          module: a.module,
          wasmExecUrl: a.wasmExecUrl,
          engineLogs: this.pool.engineLogs,
        }),
      () => {}, // reported by WorkerPool.fatal
    );
    return w;
  }

  private onMessage(m: WorkerMessage) {
    switch (m.type) {
      case 'ready':
        this.ready = true;
        this.next();
        return;
      case 'initError':
        this.pool.fatal(new EngineError(`engine worker ${this.index} could not start: ${m.message}`));
        return;
      case 'exit':
        this.crash(m.message);
        return;
    }
    const job = this.current;
    if (!job || job.id !== m.id) return; // a reply from before a restart
    if (m.type === 'error') {
      this.finish(false, new EngineError(m.message));
    } else if (m.type === 'result') {
      if (!job.async) this.finish(true, m.payload);
    } else {
      const pm = ProgressMetrics.fromBinary(m.payload);
      if (isFinal(pm)) return this.finish(true, pm);
      if (!job.settled) job.onProgress?.(pm);
    }
  }

  /** Ends the running job and starts the next one. */
  private finish(ok: boolean, value: unknown) {
    const job = this.current;
    this.current = undefined;
    job?.detachAbort?.();
    job?.settle(ok, value);
    this.next();
  }

  next() {
    if (!this.ready || this.current || this.pool.disposed) return;
    let job = this.queue.shift();
    while (job?.settled) job = this.queue.shift(); // drop jobs aborted while queued
    if (!job) return;
    const id = this.pool.nextId();
    this.current = Object.assign(job, { id });
    const msg: HostMessage = { type: 'call', id, method: job.method, payload: job.payload };
    if (job.requestId) msg.requestId = job.requestId;
    this.worker.postMessage(msg, transferable(job.payload));
  }

  /** The worker died: fail its running job and start a fresh worker for the queued ones. */
  crash(message: string) {
    this.restart(new EngineError(message));
  }

  /** Terminates the worker (stopping its running job, which is settled with `reason`) and starts a fresh one. */
  restart(reason: unknown) {
    this.worker.terminate();
    const job = this.current;
    this.current = undefined;
    job?.detachAbort?.();
    job?.settle(false, reason);
    if (this.pool.disposed || this.pool.broken) return;
    this.worker = this.spawn();
  }
}

export interface WorkerPoolOptions {
  assets: Promise<EngineAssets>;
  factory: WorkerFactory;
  size: number;
  engineLogs?: boolean;
}

export class WorkerPool {
  readonly factory: WorkerFactory;
  readonly assets: Promise<EngineAssets>;
  readonly engineLogs: boolean;
  readonly slots: Slot[];
  disposed = false;
  broken: Error | undefined;
  private idCounter = 0;

  constructor(opts: WorkerPoolOptions) {
    this.factory = opts.factory;
    this.assets = opts.assets;
    this.engineLogs = opts.engineLogs ?? true;
    this.assets.catch((e: unknown) => this.fatal(e instanceof Error ? e : new Error(String(e))));
    this.slots = Array.from({ length: Math.max(1, opts.size) }, (_, i) => new Slot(i, this));
  }

  get size(): number {
    return this.slots.length;
  }

  nextId(): number {
    return ++this.idCounter;
  }

  /** Unusable pool (assets failed, worker could not start): fail everything now and later. */
  fatal(err: Error) {
    if (this.broken) return;
    this.broken = err;
    this.terminateAll(err);
  }

  /** A synchronous engine call (one proto in, one out) on the least busy worker. */
  call(
    method: SyncMethod,
    payload: Uint8Array,
    opts: { signal?: AbortSignal | undefined } = {},
  ): Promise<Uint8Array> {
    return this.enqueue({ method, payload, async: false, signal: opts.signal }) as Promise<Uint8Array>;
  }

  /** An async engine call: resolves with the final ProgressMetrics, forwarding the others. */
  callAsync(
    method: AsyncMethod,
    payload: Uint8Array,
    requestId: string,
    opts: { signal?: AbortSignal | undefined; onProgress?: ((pm: ProgressMetrics) => void) | undefined } = {},
  ): Promise<ProgressMetrics> {
    return this.enqueue({
      method,
      payload,
      requestId,
      async: true,
      signal: opts.signal,
      onProgress: opts.onProgress,
    }) as Promise<ProgressMetrics>;
  }

  private enqueue(spec: Omit<Job, 'settle' | 'settled'>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.disposed) return reject(new Error('The engine client is disposed.'));
      if (this.broken) return reject(this.broken);
      if (spec.signal?.aborted) return reject(abortReason(spec.signal));
      const job: Job = {
        ...spec,
        settled: false,
        settle: (ok, value) => {
          if (job.settled) return;
          job.settled = true;
          if (ok) resolve(value);
          else reject(value);
        },
      };
      const slot = this.slots.reduce((a, b) => (b.load < a.load ? b : a));
      if (job.signal) {
        const signal = job.signal;
        const onAbort = () => {
          if (slot.current === job) slot.restart(abortReason(signal));
          else job.settle(false, abortReason(signal)); // still queued: next() skips it
        };
        signal.addEventListener('abort', onAbort, { once: true });
        job.detachAbort = () => signal.removeEventListener('abort', onAbort);
      }
      slot.queue.push(job);
      slot.next();
    });
  }

  private terminateAll(err: Error) {
    for (const slot of this.slots) {
      slot.worker.terminate();
      for (const job of [slot.current, ...slot.queue.splice(0)]) {
        job?.detachAbort?.();
        job?.settle(false, err);
      }
      slot.current = undefined;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.terminateAll(new Error('The engine client was disposed.'));
  }
}
