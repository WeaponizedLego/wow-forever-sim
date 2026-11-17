// Compare: 2–4 characters (saved variants and/or the current draft) simmed with one shared seed and
// iteration count, each against the first (the baseline): DPS ± CI, Δ with a Welch verdict, what differs,
// stat sheet differences and a compact ability table. State lives for the page load, like Top gear.
import type { Character } from '@fsim/contracts';
import { abilityBreakdown, summarize, type AbilityRow } from '@fsim/analysis';
import { loadSpecPresets, type SpecPresets } from '@fsim/gamedata';
import { engineErrorText } from '@fsim/engine';
import type { UnitStats } from '@fsim/proto/common';
import { diffCharacters, type ChangeGroup } from '~/utils/character-diff';
import { abilityCompareRows, statDiffRows, vsBaseline, type VsBaseline } from '~/utils/compare-rows';
import { diffNames } from './workbench';

export const COMPARE_MAX = 4;
export const COMPARE_LETTERS = ['A', 'B', 'C', 'D'] as const;
/** Option id of the current draft (variant ids are UUIDs). */
export const COMPARE_DRAFT_ID = 'draft';
export const COMPARE_ITERATIONS = { '1k': 1000, '5k': 5000, '25k': 25000 } as const;
export type CompareIterations = keyof typeof COMPARE_ITERATIONS;

export interface CompareOption {
  id: string;
  name: string;
  character: Character;
  draft: boolean;
  createdAt: string;
}

export interface CompareEntry {
  id: string;
  letter: string;
  name: string;
  /** Snapshot taken when the batch started. */
  character: Character;
  draft: boolean;
}

export interface CompareResult {
  mean: number;
  stdev: number;
  n: number;
  ci95: number;
  abilities: AbilityRow[];
}

interface CompareBatch {
  entries: CompareEntry[];
  seed: number;
  iterations: number;
  results: Record<string, CompareResult>;
  /** Final stats from the engine's character sheet; null when it failed. */
  sheets: Record<string, UnitStats | null>;
  status: 'running' | 'done' | 'cancelled' | 'error';
  /** Variants finished. */
  done: number;
  /** 0–1 across the batch. */
  progress: number;
  wallMs: number;
  error: string | null;
}

export interface CompareRow extends CompareEntry, Partial<VsBaseline> {
  baseline: boolean;
  result: CompareResult | null;
  /** What differs from the baseline (empty for the baseline). */
  changes: ChangeGroup[];
}

const picked = ref<string[]>([]);
const batch = ref<CompareBatch | null>(null);
const presets = shallowRef<SpecPresets | null>(null);
let abort: AbortController | null = null;

export function useCompare() {
  const session = useSession();
  const wb = useWorkbench();

  /** The current draft first, then saved variants, newest first. */
  const options = computed<CompareOption[]>(() => [
    ...(wb.draft.value
      ? [
          {
            id: COMPARE_DRAFT_ID,
            name: 'Current draft',
            character: wb.draft.value,
            draft: true,
            createdAt: '',
          },
        ]
      : []),
    ...wb.variants.value.map((v) => ({
      id: v.id,
      name: v.name,
      character: v.character,
      draft: false,
      createdAt: v.createdAt,
    })),
  ]);

  // Drop picks whose variant was deleted (or the draft, when there is none).
  watch(options, (opts) => {
    const ids = new Set(opts.map((o) => o.id));
    if (picked.value.some((id) => !ids.has(id))) picked.value = picked.value.filter((id) => ids.has(id));
  });

  /** Tick or untick an option; the first ticked is the baseline. At most COMPARE_MAX. */
  function toggle(id: string) {
    if (picked.value.includes(id)) picked.value = picked.value.filter((x) => x !== id);
    else if (picked.value.length < COMPARE_MAX) picked.value = [...picked.value, id];
  }
  function makeBaseline(id: string) {
    if (picked.value.includes(id)) picked.value = [id, ...picked.value.filter((x) => x !== id)];
  }

  const running = computed(() => batch.value?.status === 'running');

  async function run(iterations: number) {
    const byId = new Map(options.value.map((o) => [o.id, o]));
    const entries: CompareEntry[] = picked.value
      .map((id) => byId.get(id))
      .filter((o): o is CompareOption => !!o)
      .map((o, i) => ({
        id: o.id,
        letter: COMPARE_LETTERS[i]!,
        name: o.name,
        character: structuredClone(toRaw(o.character)) as Character,
        draft: o.draft,
      }));
    if (entries.length < 2) throw new Error('Pick at least two to compare');
    abort?.abort();
    const ctl = new AbortController();
    abort = ctl;
    batch.value = {
      entries,
      seed: Math.floor(Math.random() * 2 ** 31),
      iterations,
      results: {},
      sheets: {},
      status: 'running',
      done: 0,
      progress: 0,
      wallMs: 0,
      error: null,
    };
    const b = batch.value;
    const t0 = performance.now();
    const tick = () => (b.wallMs = performance.now() - t0);
    try {
      // Names for "what differs": the baseline's rotation presets.
      void loadSpecPresets(entries[0]!.character.spec)
        .then((p) => (presets.value = p))
        .catch(() => {});
      // Stat sheets first: cheap, and they show while the sims run.
      const sheets = await Promise.all(
        entries.map((e) =>
          characterSheet(e.character)
            .then((s) => s.finalStats ?? null)
            .catch(() => null),
        ),
      );
      entries.forEach((e, i) => (b.sheets[e.id] = sheets[i]!));
      for (const [i, e] of entries.entries()) {
        const result = await simVariant(e.character, {
          iterations,
          seed: b.seed,
          signal: ctl.signal,
          onProgress: (f) => {
            b.progress = (i + f) / entries.length;
            tick();
          },
        });
        const s = summarize(result.raidMetrics!.dps!, result.iterationsDone);
        b.results[e.id] = {
          mean: s.mean,
          stdev: s.stdev,
          n: s.n,
          ci95: s.ci95,
          abilities: abilityBreakdown(result),
        };
        b.done = i + 1;
        b.progress = (i + 1) / entries.length;
        tick();
      }
      b.status = 'done';
    } catch (e) {
      if (ctl.signal.aborted) b.status = 'cancelled';
      else {
        b.status = 'error';
        b.error = engineErrorText(e);
      }
    } finally {
      if (abort === ctl) abort = null;
    }
  }

  function cancel() {
    abort?.abort();
  }

  /** One row per entry, the baseline first; deltas and verdicts once both results are in. */
  const rows = computed<CompareRow[]>(() => {
    const b = batch.value;
    if (!b) return [];
    const base = b.entries[0]!;
    const ref = b.results[base.id];
    const names = diffNames(wb.db.value, presets.value);
    return b.entries.map((e, i) => {
      const result = b.results[e.id] ?? null;
      return {
        ...e,
        baseline: i === 0,
        result,
        changes: i === 0 ? [] : diffCharacters(base.character, e.character, names),
        ...(result && ref && vsBaseline(result, ref, i === 0)),
      };
    });
  });

  const statRows = computed(() => {
    const b = batch.value;
    return b ? statDiffRows(b.entries.map((e) => b.sheets[e.id])) : [];
  });
  /** Whether every sheet came back (so an empty stat list means "no differences"). */
  const sheetsReady = computed(() => {
    const b = batch.value;
    return !!b && b.entries.every((e) => b.sheets[e.id] !== undefined);
  });

  const abilityRows = computed(() => {
    const b = batch.value;
    return b ? abilityCompareRows(b.entries.map((e) => b.results[e.id]?.abilities)) : [];
  });

  /**
   * Load an entry's character into the Workbench draft: a saved variant keeps its lineage (loadVariant),
   * the draft's snapshot replaces the draft.
   */
  async function openInWorkbench(entry: CompareEntry) {
    if (!entry.draft && wb.variants.value.some((v) => v.id === entry.id)) await wb.loadVariant(entry.id);
    else await wb.openCharacter(entry.character);
    await navigateTo('/workbench');
  }

  return {
    options,
    picked,
    toggle,
    makeBaseline,
    batch,
    running,
    run,
    cancel,
    rows,
    statRows,
    sheetsReady,
    abilityRows,
    openInWorkbench,
    variantsLoaded: wb.variantsLoaded,
    hasDraft: computed(() => !!session.character.value),
  };
}
