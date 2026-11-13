// Engine and game data for the whole app: one engine client and one decoded item database per page
// load, created on first use. Files come from our own origin (public/engine/, see scripts/stage-engine.mjs).
import type { EngineVersion } from '@fsim/contracts';
import { createBrowserEngineClient, type WasmEngineClient } from '@fsim/engine';
import { ItemSearchIndex, loadDatabase, type GameDatabase } from '@fsim/gamedata';
import lockJson from '../../../../engine.lock.json';
import { EngineLockSchema } from '@fsim/contracts';

export interface StagedEngine {
  engineId: string;
  source: 'local' | 'release';
  commit: string;
  dataBuild: string | null;
  base: string;
  sha256: Record<'lib.wasm.gz' | 'wasm_exec.js' | 'db.bin' | 'leftover_db.bin', string>;
  /** sha256 of the unzipped lib.wasm (absent in current.json files staged before it was added). */
  wasmRawSha256?: string;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const status = ref<EngineStatus>('idle');
const error = ref<string | null>(null);
const staged = shallowRef<StagedEngine | null>(null);

let stagedPromise: Promise<StagedEngine | null> | null = null;
let clientPromise: Promise<WasmEngineClient> | null = null;
let dbPromise: Promise<GameDatabase> | null = null;
let searchIndex: ItemSearchIndex | null = null;

function loadStaged(): Promise<StagedEngine | null> {
  stagedPromise ??= fetch('/engine/current.json')
    .then(async (r) => (r.ok ? ((await r.json()) as StagedEngine) : null))
    .catch(() => null)
    .then((s) => {
      staged.value = s;
      if (!s) status.value = 'unavailable';
      return s;
    });
  return stagedPromise;
}

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The engine client (Web Worker pool). Rejects when no engine is staged. */
function engineClient(): Promise<WasmEngineClient> {
  clientPromise ??= (async () => {
    status.value = 'loading';
    const s = await loadStaged();
    if (!s) throw new Error('No engine is staged for this build.');
    const lock = EngineLockSchema.parse(lockJson);
    const client = createBrowserEngineClient({
      lock: { ...lock, engineId: s.engineId },
      sources: {
        wasm: `${s.base}lib.wasm.gz`,
        wasmExec: `${s.base}wasm_exec.js`,
        // Every staged engine is verified. wasmRaw covers servers that unzip lib.wasm.gz on the way
        // (Content-Encoding: gzip), as the Nuxt dev server does.
        sha256: {
          wasm: s.sha256['lib.wasm.gz'],
          wasmRaw: s.wasmRawSha256,
          wasmExec: s.sha256['wasm_exec.js'],
        },
      },
    });
    status.value = 'ready';
    return client;
  })().catch((e: unknown) => {
    error.value = e instanceof Error ? e.message : String(e);
    status.value = staged.value ? 'error' : 'unavailable';
    clientPromise = null;
    throw e;
  });
  return clientPromise;
}

/** The decoded item database for the staged engine version. */
function gameDatabase(): Promise<GameDatabase> {
  dbPromise ??= (async () => {
    const s = await loadStaged();
    if (!s) throw new Error('No game data is staged for this build.');
    const [main, leftover] = await Promise.all([bytes(`${s.base}db.bin`), bytes(`${s.base}leftover_db.bin`)]);
    return loadDatabase(main, leftover);
  })().catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function itemSearch(): Promise<ItemSearchIndex> {
  searchIndex ??= new ItemSearchIndex(await gameDatabase());
  return searchIndex;
}

export function useEngine() {
  void loadStaged();
  const version = computed<EngineVersion | null>(() =>
    staged.value
      ? { engineId: staged.value.engineId, commit: staged.value.commit, dataBuild: staged.value.dataBuild }
      : null,
  );
  return {
    status: readonly(status),
    error: readonly(error),
    staged: readonly(staged),
    version,
    client: engineClient,
    gameDatabase,
    itemSearch,
  };
}
