<script setup lang="ts">
import type { StartBaseline } from '~/composables/start';

// Upstream's reference profiles simmed at engine sync (tools/engine-build/smoke-baseline.json).
// With a previous baseline this becomes the "tuning since" chart; until the second sync there is
// nothing to compare, so it shows the reference DPS and says so.
const props = withDefaults(defineProps<{ span: number; previous?: StartBaseline | null }>(), {
  previous: null,
});

const b = START_BASELINE;
const rows = startReferenceRows(b);
const max = Math.max(...rows.map((r) => r.dps));
const iterations = Object.values(b.specs)[0]?.iterations ?? 0;
const skipped = startSkippedLabels(b);
const deltas = computed(() => (props.previous ? startTuningDeltas(props.previous, b) : []));
const deltaMax = computed(() => Math.max(5, ...deltas.value.map((d) => Math.ceil(Math.abs(d.value)))));
</script>

<template>
  <UiPanel
    :title="previous ? `Tuning since engine ${previous.engineId}` : `Reference DPS · engine ${b.engineId}`"
    :span="span"
  >
    <template #meta>
      <ChartsLegend
        v-if="previous"
        :items="[
          { label: 'Gain', mark: 'swatch', color: 'var(--series-1)' },
          { label: 'Loss', mark: 'swatch', color: 'var(--series-2)' },
        ]"
      />
      <span v-else class="num">upstream test profiles · {{ formatNumber(iterations, 0) }} it</span>
    </template>

    <div v-if="previous" class="body">
      <ChartsDivergingBar
        :rows="deltas"
        :max="deltaMax"
        :label="`DPS change per reference profile since engine ${previous.engineId}.`"
      />
    </div>
    <template v-else>
      <ul class="ref" aria-label="Reference DPS per profile">
        <li v-for="r in rows" :key="r.key" class="ref__row">
          <span class="ref__name"><UiClassMarker :cls="r.cls" />{{ r.label }}</span>
          <ChartsInlineBar :value="r.dps" :max="max" :text="formatNumber(r.dps, 1)" text-width="52px" />
        </li>
      </ul>
      <p class="note">
        Tuning deltas per profile appear here after the next engine sync, measured against this baseline.
        <template v-if="skipped.length"> No reference sim upstream for: {{ skipped.join(', ') }}.</template>
      </p>
    </template>
  </UiPanel>
</template>

<style scoped>
.body {
  padding: 10px var(--space-4) var(--space-4);
}
.ref {
  list-style: none;
  margin: 0;
  padding: 10px var(--space-4) 6px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
}
.ref__row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 4px 0;
  font-size: var(--text-sm);
}
.ref__name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.note {
  margin: 0;
  padding: 8px var(--space-4) 12px;
  border-top: 1px solid var(--line-row);
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .ref {
    grid-template-columns: minmax(0, 1fr);
  }
  .ref__row {
    grid-template-columns: 140px minmax(0, 1fr);
  }
}
</style>
