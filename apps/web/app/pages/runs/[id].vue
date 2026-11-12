<script setup lang="ts">
// Run analysis (docs/features.md §3): one run against its baseline.
import { RaidSimResult } from '@fsim/proto/api';
import { CLASSES, RACES, SPECS } from '@fsim/contracts';

const route = useRoute();
const session = useSession();
const engine = useEngine();
const hitScaling = useHitScaling();

const runId = computed(() => `#${String(route.params.id)}`);
const entry = computed(() => session.run(runId.value));
const base = computed(() => {
  const id = entry.value?.record.baselineId;
  return id ? session.run(id) : null;
});
// Read the run list itself: runStatWeights attaches the result to the existing entry object.
const statWeights = computed(() => {
  void session.runs.value;
  return entry.value?.statWeights ?? null;
});
const a = useRunAnalysis(entry, base, statWeights);

useHead(() => ({ title: `Run ${runId.value} · forever/sim` }));

const record = computed(() => entry.value?.record ?? null);
const char = computed(() => record.value?.character ?? null);
const spec = computed(() => SPECS.find((s) => s.id === char.value?.spec));
const workers = ref<number | null>(null);
onMounted(async () => {
  workers.value = (await engine.client().catch(() => null))?.concurrency ?? null;
});

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const meta = computed(() => {
  const r = record.value!;
  return [`run ${r.id}`, r.baselineId ? `baseline ${r.baselineId}` : 'no baseline', when(r.createdAt)].join(
    ' · ',
  );
});
const headerItems = computed(() => {
  const r = record.value!;
  const e = r.character.encounter;
  return [
    { label: 'Iterations', value: formatNumber(r.iterations, 0) },
    {
      label: 'Fight',
      value: `${e.durationSec}s ±${e.durationVariationSec}s · ${e.targetCount} tgt`,
    },
    { label: 'Seed', value: String(r.seed) },
    { label: 'Engine', value: `${r.engine.engineId} @ ${r.engine.commit.slice(0, 7)}` },
    {
      label: 'Wall',
      value: `${formatNumber(r.summary.wallMs / 1000, 1)}s${workers.value ? ` · ${workers.value} workers` : ''}`,
    },
  ];
});

// ---- actions
const actionError = ref<string | null>(null);
const shared = ref(false);
async function share() {
  await navigator.clipboard.writeText(window.location.href);
  shared.value = true;
  setTimeout(() => (shared.value = false), 1500);
}
function exportJson() {
  const e = entry.value!;
  const json = JSON.stringify(RaidSimResult.toJson(e.result), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `run-${runSlug(e.record.id)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
const busy = computed(() => session.progress.value !== null);
async function rerun() {
  actionError.value = null;
  try {
    const next = await session.runSim({ iterations: record.value!.iterations });
    await navigateTo(`/runs/${runSlug(next.record.id)}`);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError'))
      actionError.value = e instanceof Error ? e.message : String(e);
  }
}

// ---- stat weights
// As many iterations per stat as the run had (what upstream does); fewer leave the CIs wider than the weights.
const weightIterations = computed(() => record.value?.iterations ?? 5000);
const weightStats = computed(() => (char.value ? weightStatsFor(char.value.spec) : null));
const weightsError = ref<string | null>(null);
const weightsRunning = computed(() => session.progress.value?.kind === 'stat-weights');
async function computeWeights() {
  weightsError.value = null;
  const w = weightStats.value!;
  try {
    await session.runStatWeights(w.stats, w.reference, {
      runId: runId.value,
      iterations: weightIterations.value,
    });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError'))
      weightsError.value = e instanceof Error ? e.message : String(e);
  }
}

const hit = computed(() => hitScaling.state(runId.value));
</script>

<template>
  <main class="page">
    <UiEmptyState
      v-if="!entry || !record || !char"
      :title="`Run ${runId} is not in this session`"
      body="Runs live in this browser tab until history lands. Start a new run, or open the latest one."
    >
      <UiButton variant="primary" to="/">New run</UiButton>
      <UiButton v-if="session.latest.value" :to="`/runs/${runSlug(session.latest.value.record.id)}`"
        >Latest run</UiButton
      >
    </UiEmptyState>

    <template v-else>
      <UiPageHeader
        :title="char.name || spec?.name || 'Character'"
        :subtitle="`· ${RACES[char.race].name} ${spec?.name ?? CLASSES[char.class].name} · ${char.level}`"
        :meta="meta"
        :marker="char.class"
        :items="headerItems"
      >
        <template #actions>
          <UiButton @click="exportJson">Export JSON</UiButton>
          <UiButton @click="share">{{ shared ? 'Link copied' : 'Share' }}</UiButton>
          <UiButton to="/workbench">Add variant</UiButton>
          <UiButton variant="primary" :disabled="busy" @click="rerun">Re-run</UiButton>
        </template>
      </UiPageHeader>

      <div v-if="session.progress.value?.kind === 'sim' || actionError" class="status">
        <UiProgressBar
          v-if="session.progress.value?.kind === 'sim'"
          label="Sim"
          :value="session.progress.value.fraction ?? undefined"
          :detail="`${formatNumber(session.progress.value.completed, 0)} / ${formatNumber(session.progress.value.total, 0)} it`"
        />
        <UiButton v-if="busy" variant="quiet" size="sm" @click="session.cancel()">Cancel</UiButton>
        <p v-if="actionError" class="error">{{ actionError }}</p>
      </div>

      <UiPanelGrid>
        <AnalysisKpiStrip
          v-if="a.summary.value"
          :summary="a.summary.value"
          :base-summary="a.baseSummary.value"
          :baseline-id="record.baselineId ?? null"
          :welch="a.welch.value"
          :stable-after="a.convergence.value?.stableAfter ?? null"
        />

        <AnalysisDistributionPanel
          v-if="a.histogram.value && a.summary.value"
          :run-id="record.id"
          :baseline-id="record.baselineId ?? null"
          v-bind="a.histogram.value"
          :mean="a.summary.value.mean"
          :baseline-mean="a.baseSummary.value?.mean"
          :p5="a.summary.value.percentiles?.p5"
          :p95="a.summary.value.percentiles?.p95"
        />

        <AnalysisConvergencePanel
          v-if="a.convergence.value"
          :points="a.convergence.value.points"
          :y-domain="a.convergence.value.yDomain"
          :stable-after="a.convergence.value.stableAfter"
          :tolerance="a.convergence.value.tolerance"
        />

        <AnalysisTimelinePanel
          v-if="a.timeline.value && a.summary.value"
          v-bind="a.timeline.value"
          :run-mean="a.summary.value.mean"
          :iterations="record.iterations"
          :lanes="a.lanes.value"
          :always-on="a.alwaysOn.value"
          :resource="a.resource.value"
        />

        <AnalysisAbilityTable :rows="a.abilities.value" />

        <UiPanelStack :span="4">
          <AnalysisStatWeightsPanel
            :rows="a.weights.value"
            :running="weightsRunning"
            :progress="
              session.progress.value?.kind === 'stat-weights' ? session.progress.value.fraction : null
            "
            :error="weightsError"
            :stats-text="weightStats ? weightStats.stats.map(statLabel).join(', ').toLowerCase() : ''"
            :iterations="weightIterations"
            @compute="computeWeights"
            @cancel="session.cancel()"
          />
          <AnalysisHitScalingPanel
            :state="hit"
            :iterations="HIT_SCALING_ITERATIONS"
            @run="hitScaling.run(entry!)"
            @cancel="hitScaling.cancel(runId)"
          />
        </UiPanelStack>

        <AnalysisRunNotes :notes="a.notes.value" />
      </UiPanelGrid>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) 40px;
}
.status {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.status > :first-child {
  flex-grow: 1;
}
.error {
  margin: 0;
  color: var(--status-warning);
  font-size: var(--text-sm);
}
@media (max-width: 640px) {
  .page {
    padding: var(--space-4) var(--space-4) 32px;
  }
}
</style>
