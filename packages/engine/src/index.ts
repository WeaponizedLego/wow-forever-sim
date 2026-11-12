// @fsim/engine (lane L2): runs the wowsims/forever engine (MIT) as WASM in workers and implements
// EngineClient. Browser-safe; the Node worker_threads adapter lives in `@fsim/engine/node`.
export { WasmEngineClient, DEFAULT_MAX_CONCURRENCY, type EngineClientOptions } from './client';
export { createBrowserEngineClient, wrapWebWorker, type BrowserEngineOptions } from './browser';
export { WorkerPool, EngineError, type WorkerLike, type WorkerFactory, type WorkerPoolOptions } from './pool';
export {
  loadEngineAssets,
  assetSourcesFromLock,
  engineVersionFromLock,
  gunzipIfNeeded,
  sha256Hex,
  EngineIntegrityError,
  type EngineAssets,
  type EngineAssetSources,
} from './loader';
export {
  buildPlayerDatabase,
  withDatabases,
  withStatWeightsDatabase,
  indexUIDatabase,
  consumableIds,
  PARTY_BUFF_ITEM_IDS,
  type UIDatabaseIndex,
} from './database';
export type { HostMessage, WorkerMessage, EngineMethod, SyncMethod, AsyncMethod } from './protocol';
