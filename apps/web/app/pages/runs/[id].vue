<script setup lang="ts">
// Run analysis (docs/features.md §3): one run against its baseline.
import { RaidSimResult } from '@fsim/proto/api';
import { CLASSES, RACES, SPECS } from '@fsim/contracts';
import {
  fightChange,
  fightLabel,
  findRotation,
  loadSpecPresets,
  sliceRanAsScheduled,
  type SpecPresets,
} from '@fsim/gamedata';
import { engineErrorText } from '@fsim/engine';
import { comparableBaseline, lineageOf } from '~/utils/lineage';

const route = useRoute();
const session = useSession();
const engine = useEngine();
const hitScaling = useHitScaling();

const runId = computed(() => `#${String(route.params.id)}`);
const entry = computed(() => session.run(runId.value));
// Only a run of the same character lineage is a baseline (utils/lineage.ts); older records may name the
// previous run of another character.
const base = computed(() => (entry.value ? comparableBaseline(entry.value.record, session.run) : null));
const baseId = computed(() => base.value?.record.id ?? null);
// The baseline simmed another fight: its Δ is not like-for-like.
const baseFightChange = computed(() =>
  entry.value && base.value
    ? fightChange(base.value.record.character.encounter, entry.value.record.character.encounter)
    : null,
);
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
// The rotation the run used, by name: it decides what was cast, and no import carries one.
const presets = shallowRef<SpecPresets | null>(null);
watch(
  () => char.value?.spec,
  async (id) => {
    presets.value = id ? await loadSpecPresets(id) : null;
  },
  { immediate: true },
);
const rotationName = computed(() => {
  const r = char.value?.rotation;
  if (!r) return null;
  if (r.kind === 'siml') return 'Custom SIML';
  return (presets.value && findRotation(presets.value, r.presetId)?.name) ?? r.presetId;
});
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
  return [`run ${r.id}`, baseId.value ? `baseline ${baseId.value}` : 'no baseline', when(r.createdAt)].join(
    ' · ',
  );
});
const headerItems = computed(() => {
  const r = record.value!;
  const e = r.character.encounter;
  return [
    { label: 'Iterations', value: formatNumber(r.iterations, 0) },
    // An engine without our slice patch sims the later pulls' mobs as never there; say so rather than mislabel.
    sliceRanAsScheduled(e, entry.value!.result)
      ? { label: 'Fight', value: fightLabel(e) }
      : {
          label: 'Fight',
          value: `${fightLabel(e)} · not as scheduled (engine lacks slice support)`,
          tone: 'down' as const,
        },
    ...(rotationName.value ? [{ label: 'Rotation', value: rotationName.value }] : []),
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
const shareButton = useShareButton();
const share = () => shareButton.share(sharePayloadForRun(record.value!));
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
    const r = record.value!;
    const next = await session.runSim({
      iterations: r.iterations,
      character: r.character,
      lineage: { lineageId: lineageOf(r), baselineId: r.id },
    });
    await navigateTo(`/runs/${runSlug(next.record.id)}`);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) actionError.value = engineErrorText(e);
  }
}

// Add variant: this run's character becomes the Workbench draft, in its lineage and compared against this run.
async function addVariant() {
  if (record.value && session.openRun(record.value.id)) await navigateTo('/workbench');
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
      pseudoStats: w.pseudoStats,
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
    <p v-if="!entry && !session.hydrated.value" class="loading">Loading run {{ runId }}…</p>
    <UiEmptyState
      v-else-if="!entry || !record || !char"
      :title="`Run ${runId} is not in this browser`"
      body="It is not in this browser's run history; it may have been cleared or made in another browser. Start a new run, or open the latest one."
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
          <UiButton @click="share">{{ shareButton.label.value }}</UiButton>
          <UiButton @click="addVariant">Add variant</UiButton>
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
        <div v-if="actionError" class="error" role="alert"><UiErrorText :text="actionError" /></div>
      </div>

      <UiPanelGrid>
        <AnalysisRunSummary
          v-if="a.summary.value"
          :entry="entry"
          :summary="a.summary.value"
          :abilities="a.abilities.value"
        />

        <AnalysisKpiStrip
          v-if="a.summary.value"
          :summary="a.summary.value"
          :base-summary="a.baseSummary.value"
          :baseline-id="baseId"
          :welch="a.welch.value"
          :fight-change="baseFightChange"
          :stable-after="a.convergence.value?.stableAfter ?? null"
        />

        <AnalysisDistributionPanel
          v-if="a.histogram.value && a.summary.value"
          :run-id="record.id"
          :baseline-id="baseId"
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
.loading {
  margin: 0;
  color: var(--text-3);
}
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
