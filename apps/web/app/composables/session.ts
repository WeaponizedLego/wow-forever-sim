// App state shared by the Start, Workbench, Analysis and Top gear screens.
//
// - character: the character being worked on (the "draft")
// - baseline: the character as it was at the last run; the Workbench diff is draft vs baseline
// - runs: finished runs this page load (Phase 3 persists them in IndexedDB), newest first
// - runSim / runStatWeights: build the request, run it in the engine, record the run
//
// Screens read and change state only through useSession(); they never build engine requests themselves.
import { CharacterSchema, type Character, type ImportResult, type RunRecord } from '@fsim/contracts';
import type { RaidSimResult, StatWeightsResult } from '@fsim/proto';
import { StatWeightsRequest } from '@fsim/proto/api';
import type { Stat } from '@fsim/proto/common';
import { importAny } from '@fsim/importers';
import { buildRaidSimRequest, fillFromPreset, loadSpecPresets, toImportContext } from '@fsim/gamedata';
import { withDatabases, withStatWeightsDatabase } from '@fsim/engine';
import { summarize } from '@fsim/analysis';

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
/** Diagnostics from the import that produced the current character. */
const importDiagnostics = shallowRef<ImportResult['diagnostics']>([]);
const runs = shallowRef<RunEntry[]>([]);
const progress = ref<SimProgress | null>(null);
const lastError = ref<string | null>(null);
let runCounter = 0;
let abort: AbortController | null = null;

const nextRunId = () => `#${String(++runCounter).padStart(4, '0')}`;

export function useSession() {
  const engine = useEngine();

  /** Parse pasted text (SimC, WoWSims JSON, Wowhead link) against the staged data build. Does not change state. */
  async function parseImport(text: string): Promise<ImportResult> {
    const db = await engine.gameDatabase();
    return importAny(text, toImportContext(db, engine.version.value?.dataBuild ?? ''));
  }

  /** Make an imported or preset character current. Missing talents, consumables and rotation come from the spec preset. */
  async function setCharacter(c: Character, diagnostics: ImportResult['diagnostics'] = []): Promise<void> {
    const presets = await loadSpecPresets(c.spec);
    const filled = CharacterSchema.parse(fillFromPreset(c, presets));
    character.value = filled;
    baseline.value = structuredClone(toRaw(filled));
    importDiagnostics.value = diagnostics;
  }

  /** Edit the draft. The baseline stays until the next run. */
  function updateCharacter(mutate: (c: Character) => void): void {
    if (!character.value) return;
    const next = structuredClone(toRaw(character.value));
    mutate(next);
    character.value = CharacterSchema.parse(next);
  }

  function discardChanges(): void {
    if (baseline.value) character.value = structuredClone(toRaw(baseline.value));
  }

  async function runSim(
    opts: {
      iterations: number;
      seed?: number;
      label?: RunRecord['kind'];
      /** Sim this character instead of the draft (e.g. re-running an old run). The baseline does not move. */
      character?: Character;
    } = { iterations: 5000 },
  ) {
    const c = opts.character ?? character.value;
    if (!c) throw new Error('No character');
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
      if (result.error) throw new Error(result.error.message.split('\n')[0]);
      const s = summarize(result.raidMetrics!.dps!, result.iterationsDone);
      const previous = runs.value[0];
      const record: RunRecord = {
        id: nextRunId(),
        createdAt: new Date().toISOString(),
        kind: opts.label ?? 'single',
        character: structuredClone(toRaw(c)),
        engine: engine.version.value!,
        iterations: result.iterationsDone,
        seed,
        ...(previous && { baselineId: previous.record.id }),
        summary: { dpsMean: s.mean, dpsStdev: s.stdev, dpsCi95: s.ci95, wallMs: performance.now() - t0 },
      };
      runs.value = [{ record, result }, ...runs.value];
      if (!opts.character) baseline.value = structuredClone(toRaw(c));
      return runs.value[0]!;
    } catch (e) {
      if (!signal.aborted) lastError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      progress.value = null;
      if (abort?.signal === signal) abort = null;
    }
  }

  /** Stat weights for the current character, attached to the given run (default: the latest). */
  async function runStatWeights(
    stats: Stat[],
    referenceStat: Stat,
    opts: { iterations?: number; runId?: string } = {},
  ) {
    const c = character.value;
    const entry = opts.runId ? runs.value.find((r) => r.record.id === opts.runId) : runs.value[0];
    if (!c || !entry) throw new Error('Run a sim first');
    const [client, db, presets] = await Promise.all([
      engine.client(),
      engine.gameDatabase(),
      loadSpecPresets(c.spec),
    ]);
    const raid = buildRaidSimRequest(entry.record.character, presets, db, {
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
      if (result.error) throw new Error(result.error.message.split('\n')[0]);
      // Replace the entry rather than mutate it, so computeds over run(id) see the weights arrive.
      const updated: RunEntry = { ...entry, statWeights: result };
      runs.value = runs.value.map((r) => (r === entry ? updated : r));
      return result;
    } finally {
      progress.value = null;
      abort = null;
    }
  }

  function cancel(): void {
    abort?.abort();
  }

  const latest = computed(() => runs.value[0] ?? null);
  const run = (id: string) => runs.value.find((r) => r.record.id === id) ?? null;

  return {
    character: readonly(character),
    baseline: readonly(baseline),
    importDiagnostics: readonly(importDiagnostics),
    runs: readonly(runs),
    latest,
    run,
    progress: readonly(progress),
    lastError: readonly(lastError),
    parseImport,
    setCharacter,
    updateCharacter,
    discardChanges,
    runSim,
    runStatWeights,
    cancel,
  };
}
