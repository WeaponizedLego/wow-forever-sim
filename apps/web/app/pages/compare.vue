<script setup lang="ts">
// Compare (docs/features.md §3): 2–4 saved variants and/or the current draft, simmed with one shared seed
// and iteration count, each against the first.
import { classColorVar } from '@fsim/gamedata';
import {
  COMPARE_ITERATIONS,
  COMPARE_MAX,
  type CompareIterations,
  type CompareRow,
} from '~/composables/compare';

useHead({ title: 'Compare · forever/sim' });

const cmp = useCompare();
const batch = computed(() => cmp.batch.value);
const running = computed(() => cmp.running.value);

const iterations = ref<CompareIterations>('5k');
// Open on the results when a finished batch is still around (leaving the screen keeps it).
const editing = ref(batch.value?.status !== 'done');
watch(
  () => batch.value?.status,
  (s) => {
    if (s === 'done') editing.value = false;
  },
);
const runError = ref<string | null>(null);
const opening = ref(false);

const count = computed(() => cmp.picked.value.length);
async function start() {
  runError.value = null;
  try {
    await cmp.run(COMPARE_ITERATIONS[iterations.value]);
  } catch (e) {
    runError.value = e instanceof Error ? e.message : String(e);
  }
}

const rows = computed(() => cmp.rows.value);
const withResults = computed(() => rows.value.filter((r) => r.result));
const baseChar = computed(() => batch.value?.entries[0]?.character ?? null);
const forest = computed(() => {
  const rs = withResults.value;
  if (!rs.length) return { domain: [0, 1] as [number, number], ticks: [] };
  const lo = Math.min(...rs.map((r) => r.result!.mean - r.result!.ci95));
  const hi = Math.max(...rs.map((r) => r.result!.mean + r.result!.ci95));
  const pad = (hi - lo) * 0.08 || 1;
  const domain: [number, number] = [lo - pad, hi + pad];
  return {
    domain,
    ticks: niceTicks(domain[0], domain[1], 5).filter((t) => t >= domain[0] && t <= domain[1]),
  };
});

function formatDuration(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${formatNumber(s, 1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
const headerItems = computed(() => {
  const b = batch.value;
  if (!b || editing.value) return [];
  return [
    { label: 'Variants', value: String(b.entries.length) },
    { label: 'Per variant', value: `${formatNumber(b.iterations, 0)} it` },
    { label: 'Seed', value: String(b.seed) },
    { label: 'Wall', value: formatDuration(b.wallMs) },
  ];
});
const meta = computed(() => {
  const n = cmp.options.value.length;
  return `${n} to choose from · ${count.value} of ${COMPARE_MAX} picked`;
});

async function open(row: CompareRow) {
  opening.value = true;
  try {
    await cmp.openInWorkbench(row);
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <main class="page">
    <p v-if="!cmp.variantsLoaded.value && cmp.options.value.length < 2" class="loading">Loading variants…</p>
    <UiEmptyState
      v-else-if="cmp.options.value.length < 2 && !batch"
      title="Nothing to compare yet"
      body="Save variants of your character in the workbench (Pending changes → Save as variant), then compare up to four of them here, with the current draft as one option."
    >
      <UiButton v-if="cmp.hasDraft.value" variant="primary" to="/workbench">Open workbench</UiButton>
      <UiButton v-else variant="primary" to="/">New run</UiButton>
    </UiEmptyState>

    <template v-else>
      <UiPageHeader
        title="Compare"
        subtitle="· variants side by side"
        :meta="meta"
        :marker="baseChar?.class"
        :items="headerItems"
      >
        <template #actions>
          <UiButton v-if="batch && !editing" :disabled="running" @click="editing = true"
            >Change variants</UiButton
          >
        </template>
      </UiPageHeader>

      <template v-if="editing">
        <UiPanelGrid>
          <UiPanel title="Variants" :span="12">
            <template #meta>
              <span class="sans">Tick 2–{{ COMPARE_MAX }}. The first ticked (A) is the baseline.</span>
            </template>
            <ComparePicker
              :options="cmp.options.value"
              :picked="cmp.picked.value"
              :disabled="running"
              @toggle="cmp.toggle"
              @baseline="cmp.makeBaseline"
            />
          </UiPanel>
        </UiPanelGrid>
        <div class="runbar">
          <UiSegmentedControl
            v-model="iterations"
            label="Iterations"
            :options="[
              { value: '1k', label: '1k', mono: true },
              { value: '5k', label: '5k', mono: true },
              { value: '25k', label: '25k', mono: true },
            ]"
          />
          <span class="num note"
            >{{ count }} × {{ formatNumber(COMPARE_ITERATIONS[iterations], 0) }} =
            {{ formatNumber(count * COMPARE_ITERATIONS[iterations], 0) }} fights</span
          >
          <span class="note grow">
            Every variant runs with the same seed (common random numbers), so differences come from the
            character, not from luck.
          </span>
          <UiButton v-if="batch && !running" variant="quiet" @click="editing = false"
            >Back to results</UiButton
          >
          <UiButton variant="primary" size="lg" :disabled="running || count < 2" @click="start">{{
            count < 2 ? 'Pick two to compare' : `Compare ${count} variants`
          }}</UiButton>
        </div>
      </template>

      <p v-if="runError || batch?.error" class="warn" role="alert">{{ runError ?? batch?.error }}</p>

      <div v-if="running && batch" class="progress">
        <UiProgressBar
          :label="`Variant ${batch.entries[Math.min(batch.done, batch.entries.length - 1)]?.letter} of ${batch.entries.length}`"
          :value="batch.progress"
          :detail="formatDuration(batch.wallMs)"
        />
        <UiButton variant="quiet" size="sm" @click="cmp.cancel()">Cancel</UiButton>
      </div>
      <p v-if="batch?.status === 'cancelled'" class="note">
        Cancelled: {{ batch.done }} of {{ batch.entries.length }} variants finished.
      </p>

      <UiPanelGrid v-if="batch && (!editing || running) && rows.length" class="results">
        <UiPanel title="DPS" :span="12">
          <template #meta>
            <ChartsLegend
              :items="[
                { label: 'Mean', mark: 'dot', color: 'var(--text-1)' },
                { label: '95% CI', mark: 'whisker', color: 'var(--series-baseline)' },
                { label: 'Baseline (A)', mark: 'vline', color: classColorVar(baseChar?.class ?? 'warrior') },
              ]"
            />
          </template>
          <CompareDpsTable
            :rows="rows"
            :domain="forest.domain"
            :ticks="forest.ticks"
            :base-color="classColorVar(baseChar?.class ?? 'warrior')"
            :opening="opening"
            @open="open"
          />
          <p class="note pad">
            Verdict: Welch's t-test against A, counted only when |Δ| also clears the noise floor (1.96 × the
            combined standard error). With a shared seed the runs are not independent, so the test errs on the
            side of "within noise".
          </p>
        </UiPanel>

        <UiPanel title="What differs" :span="6">
          <CompareDifferences :rows="rows" />
        </UiPanel>

        <UiPanel title="Stats" meta="computeStats, buffed" :span="6">
          <CompareStatTable
            v-if="cmp.statRows.value.length"
            :entries="batch.entries"
            :rows="cmp.statRows.value"
          />
          <p v-else class="msg">
            {{
              cmp.sheetsReady.value ? 'No stat differences: the character sheets match.' : 'Computing stats…'
            }}
          </p>
        </UiPanel>

        <UiPanel title="Abilities" meta="DPS per ability, top 10" :span="12">
          <CompareAbilityTable
            v-if="cmp.abilityRows.value.length"
            :entries="batch.entries"
            :rows="cmp.abilityRows.value"
          />
          <p v-else class="msg">Shown once the sims finish.</p>
        </UiPanel>
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
.loading {
  color: var(--text-3);
}
.sans {
  font-family: var(--font-sans);
  color: var(--text-2);
}
.runbar {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: var(--space-3);
  padding: 10px var(--space-6);
  background: var(--bg-chrome);
  border: 1px solid var(--line-seam);
}
.note {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.pad {
  margin: 0;
  padding: 10px var(--space-4) var(--space-4);
}
.grow {
  flex: 1 1 240px;
}
.warn {
  margin: var(--space-3) 0 0;
  font-size: var(--text-sm);
  color: var(--status-warning);
}
.msg {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-3);
}
.progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-3) 0;
}
.progress > :first-child {
  flex-grow: 1;
}
.results {
  margin-top: var(--space-3);
}
@media (max-width: 640px) {
  .page {
    padding: var(--space-4) var(--space-4) 32px;
  }
  .runbar {
    padding: 10px var(--space-4);
    gap: var(--space-3);
  }
}
</style>
