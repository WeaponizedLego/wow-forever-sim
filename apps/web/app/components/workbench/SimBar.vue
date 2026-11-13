<script setup lang="ts">
import { weightPlan } from '~/composables/workbench';

// Sticky bar at the bottom of the Workbench: iterations, expected CI, stat weights, and the one primary
// action (⌘↵ / Ctrl+↵). While a sim runs it turns into the progress bar with Cancel.
const session = useSession();
const wb = useWorkbench();

const ITER = { '1k': 1000, '5k': 5000, '25k': 25000 } as const;
const iterations = ref<keyof typeof ITER>('5k');
const withWeights = ref(true);
const error = ref<string | null>(null);

const n = computed(() => ITER[iterations.value]);
const ciNote = computed(() => {
  const run = wb.lastRun.value;
  if (!run) return 'expected ±: shown after the first run';
  const ci = (1.96 * run.summary.dpsStdev) / Math.sqrt(n.value);
  return `expected ±${formatNumber(ci, 1)} DPS (σ ${formatNumber(run.summary.dpsStdev, 0)} from run ${run.id})`;
});
const label = computed(() => (wb.baseRunId.value ? `Sim draft vs ${wb.baseRunId.value}` : 'Sim draft'));

const progress = computed(() => session.progress.value);
const progressLabel = computed(() =>
  progress.value?.kind === 'stat-weights'
    ? 'Stat weights'
    : `Simulating ${formatNumber(n.value, 0)} iterations`,
);
const progressDetail = computed(() => {
  const p = progress.value;
  if (!p) return undefined;
  if (p.kind === 'stat-weights') return 'one run per stat';
  return p.total ? `${formatNumber(p.completed, 0)} / ${formatNumber(p.total, 0)} it` : 'starting engine';
});

async function run() {
  const c = wb.draft.value;
  if (!c || progress.value) return;
  error.value = null;
  let id: string;
  try {
    const entry = await session.runSim({ iterations: n.value });
    id = entry.record.id;
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError'))
      error.value = session.lastError.value ?? (e instanceof Error ? e.message : String(e));
    return;
  }
  if (withWeights.value) {
    const plan = weightPlan(c.spec);
    try {
      await session.runStatWeights(plan.stats, plan.reference, { pseudoStats: plan.pseudoStats });
    } catch {
      // The run itself finished; the run page shows it without weights.
    }
  }
  await navigateTo(`/runs/${id.replace(/^#/, '')}`);
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    void run();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="simbar" role="region" aria-label="Sim">
    <div class="simbar__inner">
      <template v-if="progress">
        <UiProgressBar
          class="simbar__progress"
          :label="progressLabel"
          :value="progress.fraction ?? undefined"
          :detail="progressDetail"
        />
        <UiButton @click="session.cancel()">Cancel</UiButton>
      </template>
      <template v-else>
        <UiSegmentedControl
          v-model="iterations"
          label="Iterations"
          :options="[
            { value: '1k', label: '1k', mono: true },
            { value: '5k', label: '5k', mono: true },
            { value: '25k', label: '25k', mono: true },
          ]"
        />
        <span class="num note">{{ ciNote }}</span>
        <UiCheckbox v-model="withWeights">Stat weights</UiCheckbox>
        <span v-if="error" class="err" role="alert"
          ><UiStatusGlyph status="warning" hide-label />{{ error }}</span
        >
        <span class="grow" />
        <UiButton variant="primary" size="lg" kbd="⌘↵" :disabled="!wb.draft.value" @click="run">{{
          label
        }}</UiButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.simbar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin-top: var(--space-3);
  background: var(--bg-chrome);
  border-top: 1px solid var(--line-seam);
}
.simbar__inner {
  max-width: var(--page-max);
  margin: 0 auto;
  min-height: 52px;
  padding: 10px var(--space-6);
  display: flex;
  align-items: center;
  gap: 12px 20px;
  flex-wrap: wrap;
}
.simbar__progress {
  flex: 1 1 320px;
}
.note {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.err {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-2);
}
.grow {
  flex-grow: 1;
}
@media (max-width: 640px) {
  .simbar__inner {
    gap: 10px 16px;
    padding: 8px var(--space-5);
  }
  .simbar__inner :deep(legend) {
    display: none;
  }
  .note {
    display: none;
  }
  .simbar__inner > :deep(.btn--primary) {
    flex: 1 1 100%;
    justify-content: center;
  }
}
</style>
