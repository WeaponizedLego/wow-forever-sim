// App state shared by the Start, Workbench, Analysis and Top gear screens.
//
// - character: the character being worked on (the "draft")
// - baseline: the character as it was at the last run; the Workbench diff is draft vs baseline
// - lineageId / baseRunId: the draft's character lineage (utils/lineage.ts) and the run of that lineage it
//   is compared against (null before its first run). A new import, preset or share link starts a lineage.
// - the draft, baseline, lineage and base run are kept in localStorage (utils/draft-store.ts) and restored
//   on load, so a reload or a typed URL keeps the Workbench
// - runs: finished runs, newest first; stored in IndexedDB (composables/history.ts) and loaded on start
// - runSim / runStatWeights: build the request, run it in the engine, record the run
//
// Screens read and change state only through useSession(); they never build engine requests themselves.
import { CharacterSchema, type Character, type ImportResult, type RunRecord } from '@fsim/contracts';
import type { RaidSimResult, StatWeightsResult } from '@fsim/proto';
import { StatWeightsRequest, StatWeightsTarget } from '@fsim/proto/api';
import type { PseudoStat, Stat } from '@fsim/proto/common';
import { importAny } from '@fsim/importers';
import { buildRaidSimRequest, fillFromPreset, loadSpecPresets, toImportContext } from '@fsim/gamedata';
import { EngineError, engineErrorText, withDatabases, withStatWeightsDatabase } from '@fsim/engine';
import { summarize } from '@fsim/analysis';
import { loadDraft, saveDraft } from '~/utils/draft-store';
import { lineageOf, newLineageId, runLineage } from '~/utils/lineage';
import { withRotationPick } from '~/utils/rotation-advice';

export interface RunEntry {
  record: RunRecord;
  result: RaidSimResult;
  statWeights?: StatWeightsResult;
}

export interface SimProgress {
  kind: 'sim' | 'stat-weights';
  /** 0–1, or null before the engine reports. */
  fraction: number | null;
  completed: number;
  total: number;
}

const character = ref<Character | null>(null);
const baseline = ref<Character | null>(null);
/** Lineage of the current character (utils/lineage.ts); null without one. */
const lineageId = ref<string | null>(null);
/** Run of the same lineage the draft is compared against; null before its first run. */
const baseRunId = ref<string | null>(null);
/** Diagnostics from the import that produced the current character. */
const importDiagnostics = shallowRef<ImportResult['diagnostics']>([]);
let draftRestored = false;
const runs = shallowRef<RunEntry[]>([]);
const progress = ref<SimProgress | null>(null);
const lastError = ref<string | null>(null);
let runCounter = 0;
let abort: AbortController | null = null;
/** Stored runs loaded into `runs`; resolves once, also when IndexedDB is unavailable. */
let hydrating: Promise<void> | null = null;
const hydrated = ref(false);

/** Stat weights default: each EP to ±0.05 (90%), at most 8× the engine's first pass. */
export const DEFAULT_WEIGHT_PRECISION = { epCi: 0.05, maxIterationMultiplier: 8 } as const;

/** Store the draft (utils/draft-store.ts) after every change to it. */
function persistDraft(): void {
  const c = character.value;
  saveDraft(
    c && lineageId.value
      ? {
          character: toRaw(c),
          baseline: toRaw(baseline.value ?? c),
          lineageId: lineageId.value,
          baseRunId: baseRunId.value,
          diagnostics: toRaw(importDiagnostics.value),
        }
      : null,
  );
}

/** Put back the draft of the last visit, once per page load. */
function restoreDraft(): void {
  if (draftRestored) return;
  draftRestored = true;
  if (character.value) return;
  const d = loadDraft();
  if (!d) return;
  character.value = d.character;
  baseline.value = d.baseline;
  lineageId.value = d.lineageId;
  baseRunId.value = d.baseRunId;
  importDiagnostics.value = d.diagnostics;
}

export function useSession() {
  const engine = useEngine();
  const history = useHistory();
  restoreDraft();

  hydrating ??= history.load().then(({ runs: stored, counter }) => {
    const here = new Set(runs.value.map((r) => r.record.id));
    const loaded: RunEntry[] = stored
      .filter((s) => !here.has(s.record.id))
      .map(({ record, result, statWeights }) => ({ record, result, ...(statWeights && { statWeights }) }));
    runs.value = [...runs.value, ...loaded];
    runCounter = Math.max(runCounter, counter);
    hydrated.value = true;
  });

  /** Next run id; numbered through IndexedDB when it is there, so reloads and other tabs never reuse one. */
  async function nextRunId(): Promise<string> {
    await hydrating;
    runCounter = Math.max(runCounter, await history.nextSeq(runCounter));
    return `#${String(runCounter).padStart(4, '0')}`;
  }

  /** Parse pasted text (SimC, WoWSims JSON, Wowhead link) against the staged data build. Does not change state. */
  async function parseImport(text: string): Promise<ImportResult> {
    const db = await engine.gameDatabase();
    return importAny(text, toImportContext(db, engine.version.value?.dataBuild ?? ''));
  }

  /**
   * Make an imported, preset or shared character current. It starts a new lineage, with no baseline run.
   * Missing talents, consumables and rotation come from the preset build closest to the talents; the import's
   * rotation note then names the rotation that was picked.
   */
  async function setCharacter(c: Character, diagnostics: ImportResult['diagnostics'] = []): Promise<void> {
    const presets = await loadSpecPresets(c.spec);
    const filled = CharacterSchema.parse(fillFromPreset(c, presets));
    character.value = filled;
    baseline.value = structuredClone(toRaw(filled));
    lineageId.value = newLineageId();
    baseRunId.value = null;
    importDiagnostics.value = withRotationPick(diagnostics, filled, presets);
    persistDraft();
  }

  /**
   * Make a character of a known lineage the draft (a saved variant, a run's character): it is compared
   * against `baseRunId` (a run of that lineage, or null) and diffed against `baseline` (default: itself).
   */
  function openDraft(
    c: Character,
    opts: { lineageId: string; baseRunId: string | null; baseline?: Character },
  ): void {
    character.value = CharacterSchema.parse(structuredClone(toRaw(c)));
    baseline.value = structuredClone(toRaw(opts.baseline ?? c));
    lineageId.value = opts.lineageId;
    baseRunId.value = opts.baseRunId;
    importDiagnostics.value = [];
    persistDraft();
  }

  /** Make a run's character the draft, in the run's lineage and compared against that run. */
  function openRun(id: string): boolean {
    const entry = run(id);
    if (!entry) return false;
    const r = entry.record;
    openDraft(r.character, { lineageId: lineageOf(r), baseRunId: r.id });
    return true;
  }

  /** Edit the draft. The baseline and lineage stay until the next run. */
  function updateCharacter(mutate: (c: Character) => void): void {
    if (!character.value) return;
    const next = structuredClone(toRaw(character.value));
    mutate(next);
    character.value = CharacterSchema.parse(next);
    persistDraft();
  }

  function discardChanges(): void {
    if (baseline.value) character.value = structuredClone(toRaw(baseline.value));
    persistDraft();
  }

  async function runSim(
    opts: {
      iterations: number;
      seed?: number;
      label?: RunRecord['kind'];
      /** Sim this character instead of the draft (e.g. re-running an old run). The baseline does not move. */
      character?: Character;
      /**
       * With `character`: its lineage and the run to compare with (e.g. the run being re-run). Without it the
       * run starts a lineage of its own. A draft run always takes the draft's lineage and base run.
       */
      lineage?: { lineageId: string; baselineId: string | null };
    } = { iterations: 5000 },
  ) {
    const c = opts.character ?? character.value;
    if (!c) throw new Error('No character');
    const draftRun = !opts.character;
    const lineage = runLineage(
      draftRun
        ? lineageId.value
          ? { lineageId: lineageId.value, baselineId: baseRunId.value }
          : null
        : (opts.lineage ?? null),
      (id) => !!run(id),
    );
    lastError.value = null;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    try {
      const [client, db, presets] = await Promise.all([
        engine.client(),
        engine.gameDatabase(),
        loadSpecPresets(c.spec),
      ]);
      const req = withDatabases(
        buildRaidSimRequest(c, presets, db, { iterations: opts.iterations, seed }),
        db.raw,
      );
      progress.value = { kind: 'sim', fraction: null, completed: 0, total: opts.iterations };
      const t0 = performance.now();
      const result = await client.raidSim(req, {
        signal,
        onProgress: (p) => {
          if (p.totalIterations > 0)
            progress.value = {
              kind: 'sim',
              fraction: p.completedIterations / p.totalIterations,
              completed: p.completedIterations,
              total: p.totalIterations,
            };
        },
      });
      if (result.error) throw new EngineError(result.error.message, req);
      const s = summarize(result.raidMetrics!.dps!, result.iterationsDone);
      const id = await nextRunId();
      const record: RunRecord = {
        id,
        createdAt: new Date().toISOString(),
        kind: opts.label ?? 'single',
        character: structuredClone(toRaw(c)),
        engine: engine.version.value!,
        iterations: result.iterationsDone,
        seed,
        ...lineage,
        summary: { dpsMean: s.mean, dpsStdev: s.stdev, dpsCi95: s.ci95, wallMs: performance.now() - t0 },
      };
      runs.value = [{ record, result }, ...runs.value];
      void history.save({ record, result });
      // The draft's next comparison is this run, unless another character was loaded meanwhile.
      if (draftRun && (lineageId.value ?? lineage.lineageId) === lineage.lineageId) {
        baseline.value = structuredClone(toRaw(c));
        lineageId.value = lineage.lineageId;
        baseRunId.value = id;
        persistDraft();
      }
      return runs.value[0]!;
    } catch (e) {
      if (!signal.aborted) lastError.value = engineErrorText(e);
      throw e;
    } finally {
      progress.value = null;
      if (abort?.signal === signal) abort = null;
    }
  }

  /** Stat weights for a run's character, attached to that run (default: the latest). */
  async function runStatWeights(
    stats: Stat[],
    referenceStat: Stat,
    opts: {
      iterations?: number;
      runId?: string;
      /** Pseudo-stats to weigh too, e.g. weapon damage, so weapons can be valued. */
      pseudoStats?: PseudoStat[];
      /**
       * Keep simming until each EP's 90% ± is at most this (in EP units, reference stat = 1), capped at
       * `maxIterationMultiplier` × the first pass. Default ±0.05, ×8. Pass null for one pass of `iterations`.
       */
      precision?: { epCi: number; maxIterationMultiplier: number } | null;
    } = {},
  ) {
    const entry = opts.runId ? runs.value.find((r) => r.record.id === opts.runId) : runs.value[0];
    if (!entry) throw new Error('Run a sim first');
    const c = entry.record.character;
    const precision = opts.precision === undefined ? DEFAULT_WEIGHT_PRECISION : opts.precision;
    lastError.value = null;
    const [client, db, presets] = await Promise.all([
      engine.client(),
      engine.gameDatabase(),
      loadSpecPresets(c.spec),
    ]);
    const raid = buildRaidSimRequest(c, presets, db, {
      iterations: opts.iterations ?? 2000,
      seed: entry.record.seed,
    });
    const party = raid.raid!.parties[0]!;
    const req = withStatWeightsDatabase(
      StatWeightsRequest.create({
        player: party.players[0],
        partyBuffs: party.buffs,
        raidBuffs: raid.raid!.buffs,
        debuffs: raid.raid!.debuffs,
        encounter: raid.encounter,
        simOptions: raid.simOptions,
        statsToWeigh: stats,
        pseudoStatsToWeigh: opts.pseudoStats ?? [],
        ...(precision && { target: StatWeightsTarget.create(precision) }),
        epReferenceStat: referenceStat,
        hpsReferenceStat: referenceStat,
      }),
      db.raw,
    );
    abort = new AbortController();
    progress.value = { kind: 'stat-weights', fraction: null, completed: 0, total: 0 };
    try {
      const result = await client.statWeights(req, {
        signal: abort.signal,
        onProgress: (p) => {
          if (p.totalIterations > 0)
            progress.value = {
              kind: 'stat-weights',
              fraction: p.completedIterations / p.totalIterations,
              completed: p.completedIterations,
              total: p.totalIterations,
            };
        },
      });
      if (result.error) throw new EngineError(result.error.message);
      // Replace the entry rather than mutate it, so computeds over run(id) see the weights arrive.
      const updated: RunEntry = { ...entry, statWeights: result };
      runs.value = runs.value.map((r) => (r === entry ? updated : r));
      void history.save(updated);
      return result;
    } catch (e) {
      if (!abort?.signal.aborted) lastError.value = engineErrorText(e);
      throw e;
    } finally {
      progress.value = null;
      abort = null;
    }
  }

  function cancel(): void {
    abort?.abort();
  }

  /** Forget every run, in memory and in IndexedDB. Run numbers keep counting up. */
  async function clearHistory(): Promise<void> {
    await hydrating;
    await history.clear();
    runs.value = [];
    baseRunId.value = null;
    persistDraft();
  }

  const latest = computed(() => runs.value[0] ?? null);
  const run = (id: string) => runs.value.find((r) => r.record.id === id) ?? null;

  return {
    character: readonly(character),
    baseline: readonly(baseline),
    /** The draft's lineage (utils/lineage.ts); null without a draft. */
    lineageId: readonly(lineageId),
    /** Run of the draft's lineage it is compared against; null before its first run. */
    baseRunId: readonly(baseRunId),
    importDiagnostics: readonly(importDiagnostics),
    runs: readonly(runs),
    /** False until stored runs have been loaded (or found unavailable); /runs/<n> waits for it. */
    hydrated: readonly(hydrated),
    /** 'unavailable' when IndexedDB cannot be used: runs are then kept for this tab only. */
    historyStatus: history.status,
    clearHistory,
    latest,
    run,
    progress: readonly(progress),
    lastError: readonly(lastError),
    parseImport,
    setCharacter,
    openDraft,
    openRun,
    updateCharacter,
    discardChanges,
    runSim,
    runStatWeights,
    cancel,
  };
}
