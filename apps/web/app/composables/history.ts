// Local run history in IndexedDB, so runs survive reloads. Used only by useSession(); screens read runs
// from the session.
//
// Database "fsim-history" v1:
//   runs: { seq, record, result, statWeights?, slim } keyed by seq (the number in the run id, #0042 → 42).
//         record is the RunRecord as JSON-safe data; result / statWeights are protobuf binary
//         (RaidSimResult / StatWeightsResult .toBinary), several times smaller than JSON.
//   meta: { counter } — the last run number handed out, so numbering continues across reloads and tabs.
//
// What is kept (a 5,000-iteration shaman run is 1.35 MB as binary: ~120k per-iteration values in 24
// `allValues` arrays ≈ 0.96 MB, plus a 380 KB iteration-1 combat log; everything else is ~7 KB):
// - Every stored run drops the `allValues` arrays nothing in the app reads (all but raid DPS).
// - The newest HISTORY_FULL_RUNS also keep raid DPS `allValues` and the combat log (≈ 0.4 MB at 5k it).
// - Runs HISTORY_FULL_RUNS+1 … HISTORY_MAX_RUNS are "slim" (≈ 7 KB): no allValues, no log. They keep every
//   mean and ±, the engine's histogram, per-ability metrics and stat weights; their analysis page shows the
//   engine's histogram instead of the exact distribution, and no aura timeline.
// - Older runs are deleted. Worst case at 5k iterations: ~4.5 MB in total.
// Runs made in this tab stay complete in memory until the page reloads.
//
// When IndexedDB is unavailable (private mode in some browsers, blocked storage), every call resolves
// quietly and status says 'unavailable'; the session keeps runs in memory for the tab.
import type { RunRecord } from '@fsim/contracts';
import { RaidSimResult, StatWeightsResult } from '@fsim/proto/api';

export const HISTORY_MAX_RUNS = 50;
export const HISTORY_FULL_RUNS = 10;

const DB_NAME = 'fsim-history';
const RUNS = 'runs';
const META = 'meta';

export interface StoredRun {
  record: RunRecord;
  result: RaidSimResult;
  statWeights?: StatWeightsResult;
  /** Older run whose allValues and combat log were dropped to save space. */
  slim: boolean;
}

interface Row {
  seq: number;
  record: RunRecord;
  result: Uint8Array;
  statWeights?: Uint8Array;
  slim: boolean;
}

export type HistoryStatus = 'loading' | 'ready' | 'unavailable';

export const runSeq = (id: string) => Number(id.replace(/^#/, ''));

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    let r: IDBOpenDBRequest;
    try {
      r = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      return reject(e);
    }
    r.onupgradeneeded = () => {
      r.result.createObjectStore(RUNS, { keyPath: 'seq' });
      r.result.createObjectStore(META);
    };
    r.onsuccess = () => {
      // A newer version of the app (another tab) is upgrading the database: let it. This tab then stops
      // saving (writes fail quietly) until it is reloaded.
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

/**
 * A copy with every per-iteration `allValues` array emptied except raid DPS (which the distribution chart
 * reads); `slim` also empties that one and drops the combat log.
 */
export function trimResult(result: RaidSimResult, slim: boolean): RaidSimResult {
  const copy = RaidSimResult.clone(result);
  const raidDps = copy.raidMetrics?.dps;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'allValues' && Array.isArray(v)) {
        if (slim || o !== raidDps) (o as Record<string, unknown>)[k] = [];
      } else walk(v);
    }
  };
  walk(copy);
  if (slim) copy.logs = '';
  return copy;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const status = ref<HistoryStatus>('loading');

function db(): Promise<IDBDatabase | null> {
  dbPromise ??= open().then(
    (d) => {
      status.value = 'ready';
      return d;
    },
    (e: unknown) => {
      console.warn('history: IndexedDB unavailable, runs are kept for this tab only.', e);
      status.value = 'unavailable';
      return null;
    },
  );
  return dbPromise;
}

/** Writes are best-effort: a failure (quota, storage cleared) is logged and the run stays in memory. */
async function safely<T>(what: string, fallback: T, fn: (d: IDBDatabase) => Promise<T>): Promise<T> {
  const d = await db();
  if (!d) return fallback;
  try {
    return await fn(d);
  } catch (e) {
    console.warn(`history: ${what} failed`, e);
    return fallback;
  }
}

export function useHistory() {
  /** All stored runs, newest first, plus the last run number handed out. */
  function load(): Promise<{ runs: StoredRun[]; counter: number }> {
    return safely('load', { runs: [], counter: 0 }, async (d) => {
      const tx = d.transaction([RUNS, META], 'readonly');
      const [rows, counter] = await Promise.all([
        req(tx.objectStore(RUNS).getAll() as IDBRequest<Row[]>),
        req(tx.objectStore(META).get('counter') as IDBRequest<number | undefined>),
      ]);
      const runs: StoredRun[] = [];
      for (const row of rows.sort((a, b) => b.seq - a.seq)) {
        try {
          runs.push({
            record: row.record,
            result: RaidSimResult.fromBinary(row.result),
            ...(row.statWeights && { statWeights: StatWeightsResult.fromBinary(row.statWeights) }),
            slim: row.slim,
          });
        } catch (e) {
          console.warn(`history: run ${row.record?.id} could not be read; skipped`, e);
        }
      }
      return { runs, counter: Math.max(counter ?? 0, rows[0]?.seq ?? 0) };
    });
  }

  /**
   * Hand out the next run number. With history it comes from IndexedDB, so two tabs never reuse one;
   * `local` is the highest number this tab knows, used when storage is unavailable.
   */
  function nextSeq(local: number): Promise<number> {
    return safely('number a run', local + 1, async (d) => {
      const tx = d.transaction(META, 'readwrite');
      const store = tx.objectStore(META);
      const n = Math.max((await req(store.get('counter') as IDBRequest<number | undefined>)) ?? 0, local) + 1;
      store.put(n, 'counter');
      await done(tx);
      return n;
    });
  }

  /** Store (or replace) a run, then apply the cap. */
  function save(run: { record: RunRecord; result: RaidSimResult; statWeights?: StatWeightsResult }) {
    return safely('save', undefined, async (d) => {
      const row: Row = {
        seq: runSeq(run.record.id),
        record: JSON.parse(JSON.stringify(run.record)) as RunRecord,
        result: RaidSimResult.toBinary(trimResult(run.result, false)),
        ...(run.statWeights && { statWeights: StatWeightsResult.toBinary(run.statWeights) }),
        slim: false,
      };
      const tx = d.transaction(RUNS, 'readwrite');
      const store = tx.objectStore(RUNS);
      store.put(row);
      const keys = (await req(store.getAllKeys())) as number[];
      keys.sort((a, b) => b - a);
      for (const k of keys.slice(HISTORY_MAX_RUNS)) store.delete(k);
      for (const k of keys.slice(HISTORY_FULL_RUNS, HISTORY_MAX_RUNS)) {
        const old = (await req(store.get(k))) as Row | undefined;
        if (!old || old.slim) continue;
        old.result = RaidSimResult.toBinary(trimResult(RaidSimResult.fromBinary(old.result), true));
        old.slim = true;
        store.put(old);
      }
      await done(tx);
    });
  }

  /** Delete every stored run. Run numbering carries on, so old /runs/<n> links never point at a new run. */
  function clear() {
    return safely('clear', undefined, async (d) => {
      const tx = d.transaction(RUNS, 'readwrite');
      tx.objectStore(RUNS).clear();
      await done(tx);
    });
  }

  void db();
  return { status: readonly(status), load, nextSeq, save, clear };
}
