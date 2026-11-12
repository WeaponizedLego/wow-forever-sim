// Message protocol between the host (EngineClient / WorkerPool) and an engine worker.
// The worker is proto-agnostic: it moves binary payloads in and out of the WASM and never decodes
// them. The host decodes progress and decides when an async call is finished.
//
// This file holds types and constants only, so the worker can import it under Node's type
// stripping without pulling in any runtime dependency.

/** Engine functions that answer synchronously with one binary proto. */
export const SYNC_METHODS = [
  'computeStats',
  'raidSim',
  'raidSimRequestSplit',
  'raidSimResultCombination',
  'statWeights',
  'statWeightRequests',
  'statWeightCompute',
  'statWeightTopUpPlan',
  'bulkCombinationCount',
  'bulkCandidates',
  'abortById',
] as const;

/** Engine functions that stream `ProgressMetrics` through a callback; the last one carries the final result. */
export const ASYNC_METHODS = ['raidSimAsync', 'statWeightsAsync'] as const;

export type SyncMethod = (typeof SYNC_METHODS)[number];
export type AsyncMethod = (typeof ASYNC_METHODS)[number];
export type EngineMethod = SyncMethod | AsyncMethod;

/** Host → worker. */
export type HostMessage =
  | {
      type: 'init';
      /** Compiled once by the host and shared by structured clone. */
      module: WebAssembly.Module;
      /** URL (often a data: URL) of the `wasm_exec.js` built by the same Go version as the module. */
      wasmExecUrl: string;
      /** Forward the engine's Go log output (`log.Printf`) to the worker console. */
      engineLogs: boolean;
    }
  | {
      type: 'call';
      /** Host-side call id, echoed in every reply. */
      id: number;
      method: EngineMethod;
      payload: Uint8Array;
      /** Engine request id for async methods: the id `abortById` targets. */
      requestId?: string;
    };

/** Worker → host. */
export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'initError'; message: string }
  /** Sync call answered, or an async call accepted (empty payload; its result arrives as progress). */
  | { type: 'result'; id: number; payload: Uint8Array }
  /** One `ProgressMetrics` of an async call. */
  | { type: 'progress'; id: number; payload: Uint8Array }
  | { type: 'error'; id: number; message: string }
  /** The Go runtime exited (an unrecovered panic). The worker answers nothing more; replace it. */
  | { type: 'exit'; message: string };
