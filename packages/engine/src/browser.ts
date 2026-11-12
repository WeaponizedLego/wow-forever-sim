// Browser entry: Web Workers, assets fetched per engine.lock.json.
import type { EngineLock } from '@fsim/contracts';
import { WasmEngineClient, type EngineClientOptions } from './client';
import {
  assetSourcesFromLock,
  engineVersionFromLock,
  loadEngineAssets,
  type EngineAssetSources,
} from './loader';
import type { WorkerLike } from './pool';
import type { HostMessage, WorkerMessage } from './protocol';

export function wrapWebWorker(worker: Worker): WorkerLike {
  return {
    postMessage: (msg: HostMessage, transfer: ArrayBuffer[] = []) => worker.postMessage(msg, transfer),
    onMessage: (handler) =>
      worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => handler(e.data)),
    onError: (handler) =>
      worker.addEventListener('error', (e) => handler(new Error(e.message || 'worker error'))),
    terminate: () => worker.terminate(),
  };
}

export interface BrowserEngineOptions extends Pick<
  EngineClientOptions,
  'concurrency' | 'maxConcurrency' | 'engineLogs'
> {
  lock: EngineLock;
  /**
   * Where to get lib.wasm(.gz) and wasm_exec.js. Defaults to the lock's artifacts (sha256-verified).
   * Needed while the lock has `artifacts: null`, e.g. a dev server serving packages/engine/vendor/.
   */
  sources?: EngineAssetSources;
}

export function createBrowserEngineClient(opts: BrowserEngineOptions): WasmEngineClient {
  const sources = opts.sources ?? assetSourcesFromLock(opts.lock);
  if (!sources)
    throw new Error(`engine.lock.json has no artifacts for ${opts.lock.engineId} yet; pass sources.`);
  return new WasmEngineClient({
    assets: loadEngineAssets(sources),
    version: engineVersionFromLock(opts.lock),
    // Literal `new Worker(new URL(...), { type: 'module' })` so Vite/Nuxt bundle the worker.
    createWorker: () =>
      wrapWebWorker(
        new Worker(new URL('./worker.browser.ts', import.meta.url), { type: 'module', name: 'fsim-engine' }),
      ),
    hardwareConcurrency: typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency,
    ...(opts.concurrency !== undefined && { concurrency: opts.concurrency }),
    ...(opts.maxConcurrency !== undefined && { maxConcurrency: opts.maxConcurrency }),
    ...(opts.engineLogs !== undefined && { engineLogs: opts.engineLogs }),
  });
}
