<script setup lang="ts">
// Dev check of the browser engine path: a real WoW Forever SimC export → import → request → sim in
// Web Workers. Not a product screen; the real flow is the Start / Workbench / Analysis screens.
import { importAny } from '@fsim/importers';
import { buildRaidSimRequest, fillFromPreset, loadSpecPresets, toImportContext } from '@fsim/gamedata';
import { withDatabases } from '@fsim/engine';
import shamanSimc from '../../../../../fixtures/import/real/simc-shaman-lvl42.simc?raw';

useHead({ title: 'Engine check · forever/sim' });

const engine = useEngine();
const iterations = ref('5000');
const phase = ref<'idle' | 'loading' | 'running' | 'done' | 'error'>('idle');
const progress = ref(0);
const log = ref<CheckItem[]>([]);
const result = ref<{ dps: number; stdev: number; n: number; ms: number; workers: number } | null>(null);
let abort: AbortController | null = null;

function note(status: Status, text: string, where?: string) {
  log.value.push({ status, text, ...(where ? { where } : {}) });
}

async function run() {
  log.value = [];
  result.value = null;
  progress.value = 0;
  phase.value = 'loading';
  try {
    const t0 = performance.now();
    const [client, db] = await Promise.all([engine.client(), engine.gameDatabase()]);
    note(
      'good',
      `Engine ${engine.version.value?.engineId} and item data loaded`,
      `${Math.round(performance.now() - t0)} ms`,
    );

    const imported = importAny(shamanSimc, toImportContext(db, engine.version.value?.dataBuild ?? ''));
    for (const d of imported.diagnostics.filter((x) => x.severity !== 'info'))
      note('warning', d.message, d.line ? `line ${d.line}` : undefined);
    if (!imported.character) throw new Error('Import failed');

    const presets = await loadSpecPresets(imported.character.spec);
    const character = fillFromPreset(imported.character, presets);
    const req = withDatabases(
      buildRaidSimRequest(character, presets, db, { iterations: Number(iterations.value), seed: 42 }),
      db.raw,
    );

    phase.value = 'running';
    abort = new AbortController();
    const t1 = performance.now();
    const res = await client.raidSim(req, {
      signal: abort.signal,
      onProgress: (p) => {
        if (p.totalIterations > 0) progress.value = p.completedIterations / p.totalIterations;
      },
    });
    const dps = res.raidMetrics!.dps!;
    result.value = {
      dps: dps.avg,
      stdev: dps.stdev,
      n: res.iterationsDone,
      ms: performance.now() - t1,
      workers: client.concurrency,
    };
    note('good', `${character.spec} simmed`, `${result.value.n} iterations`);
    phase.value = 'done';
  } catch (e) {
    note('warning', e instanceof Error ? e.message : String(e));
    phase.value = 'error';
  } finally {
    abort = null;
  }
}

function cancel() {
  abort?.abort();
}
</script>

<template>
  <main class="page">
    <h1 class="title">Engine check</h1>
    <p class="lead">
      Runs a real WoW Forever SimC export (level 42 shaman) through the importer, the request builder and the
      engine in this browser's Web Workers.
    </p>
    <UiPanelGrid>
      <UiPanel title="Run" :span="5">
        <div class="controls">
          <UiSegmentedControl
            v-model="iterations"
            label="Iterations"
            :options="[
              { value: '1000', label: '1k', mono: true },
              { value: '5000', label: '5k', mono: true },
              { value: '25000', label: '25k', mono: true },
            ]"
          />
          <UiButton v-if="phase !== 'running'" variant="primary" :disabled="phase === 'loading'" @click="run">
            Run sim
          </UiButton>
          <UiButton v-else variant="secondary" @click="cancel">Cancel</UiButton>
        </div>
        <UiProgressBar
          v-if="phase === 'running' || phase === 'done'"
          label="Sim progress"
          :value="progress"
          :state="phase === 'done' ? 'done' : 'running'"
        />
        <p class="num meta">engine: {{ engine.status.value }} {{ engine.error.value ?? '' }}</p>
      </UiPanel>
      <UiKpiTile
        :span="4"
        label="Mean DPS"
        :value="result ? formatNumber(result.dps, 1) : '—'"
        :secondary="result ? `σ ${formatNumber(result.stdev, 1)}` : undefined"
        :foot="result ? `${formatNumber(result.ms / 1000, 1)} s on ${result.workers} workers` : undefined"
      />
      <UiPanel title="Log" :span="12">
        <UiCheckList :items="log" dense />
      </UiPanel>
    </UiPanelGrid>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 20px var(--space-6) 40px;
}
.title {
  margin: 0 0 4px;
  font-size: var(--text-lg);
  font-weight: 600;
}
.lead {
  margin: 0 0 var(--space-5);
  color: var(--text-2);
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4);
}
.meta {
  padding: 0 var(--space-4) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
