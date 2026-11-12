// Node entry (`@fsim/engine/node`): worker_threads, assets read from disk. Used by tests and tools.
import type { EngineVersion } from '@fsim/contracts';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { WasmEngineClient, type EngineClientOptions } from './client';
import { defaultFetchBytes, loadEngineAssets, type EngineAssetSources } from './loader';
import type { WorkerFactory, WorkerLike } from './pool';
import type { HostMessage, WorkerMessage } from './protocol';

export function wrapNodeWorker(worker: Worker): WorkerLike {
  let terminated = false;
  return {
    postMessage: (msg: HostMessage, transfer: ArrayBuffer[] = []) => worker.postMessage(msg, transfer),
    onMessage: (handler) => worker.on('message', (m: WorkerMessage) => handler(m)),
    onError: (handler) => {
      worker.on('error', handler);
      worker.on('exit', (code) => {
        if (!terminated) handler(new Error(`worker exited with code ${code}`));
      });
    },
    terminate: () => {
      terminated = true;
      void worker.terminate();
    },
  };
}

/** Runs src/worker.node.ts with Node's built-in TypeScript type stripping. */
export const nodeWorkerFactory: WorkerFactory = () =>
  wrapNodeWorker(new Worker(new URL('./worker.node.ts', import.meta.url)));

/** Reads file: URLs and plain paths from disk, anything else with fetch. */
export const nodeFetchBytes = async (url: string): Promise<Uint8Array> => {
  if (url.startsWith('file:')) return new Uint8Array(await readFile(fileURLToPath(url)));
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return defaultFetchBytes(url);
  return new Uint8Array(await readFile(url));
};

export interface NodeEngineOptions extends Pick<
  EngineClientOptions,
  'concurrency' | 'maxConcurrency' | 'engineLogs'
> {
  sources: EngineAssetSources;
  version: EngineVersion;
}

export function createNodeEngineClient(opts: NodeEngineOptions): WasmEngineClient {
  return new WasmEngineClient({
    assets: loadEngineAssets({ fetchBytes: nodeFetchBytes, ...opts.sources }),
    version: opts.version,
    createWorker: nodeWorkerFactory,
    hardwareConcurrency: availableParallelism(),
    ...(opts.concurrency !== undefined && { concurrency: opts.concurrency }),
    ...(opts.maxConcurrency !== undefined && { maxConcurrency: opts.maxConcurrency }),
    ...(opts.engineLogs !== undefined && { engineLogs: opts.engineLogs }),
  });
}

/** packages/engine/vendor/, filled by scripts/build-local.mjs. */
export const VENDOR_DIR = fileURLToPath(new URL('../vendor/', import.meta.url));

export const hasVendorEngine = (): boolean =>
  existsSync(`${VENDOR_DIR}lib.wasm`) && existsSync(`${VENDOR_DIR}wasm_exec.js`);

/** A client on the locally built engine in vendor/ (see scripts/build-local.mjs). */
export function createVendorEngineClient(
  opts: Pick<EngineClientOptions, 'concurrency' | 'maxConcurrency' | 'engineLogs'> = {},
): WasmEngineClient {
  if (!hasVendorEngine())
    throw new Error(`No engine in ${VENDOR_DIR}; run packages/engine/scripts/build-local.mjs.`);
  const manifestPath = `${VENDOR_DIR}manifest.json`;
  const commit = existsSync(manifestPath)
    ? String((JSON.parse(readFileSync(manifestPath, 'utf8')) as { commit?: string }).commit ?? '')
    : '';
  return createNodeEngineClient({
    ...opts,
    sources: { wasm: `${VENDOR_DIR}lib.wasm`, wasmExec: `${VENDOR_DIR}wasm_exec.js` },
    version: { engineId: commit ? `${commit.slice(0, 7)}-local` : 'local', commit, dataBuild: null },
  });
}
