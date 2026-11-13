<script setup lang="ts">
// DPS distribution of the run, with the baseline's on the same bins.
const props = defineProps<{
  runId: string;
  baselineId: string | null;
  bins: { lo: number; hi: number; count: number }[];
  total: number;
  binWidth: number;
  baseline?: number[] | undefined;
  baselineTotal?: number | undefined;
  mean: number;
  baselineMean?: number | undefined;
  p5?: number | undefined;
  p95?: number | undefined;
  xTicks: number[];
  showTables?: boolean;
}>();

const view = ref('chart');
const legend = computed(() => [
  { label: `Run ${props.runId}`, mark: 'swatch' as const, color: 'var(--series-1)' },
  ...(props.baseline
    ? [{ label: `Baseline ${props.baselineId}`, mark: 'dashed' as const, color: 'var(--series-baseline)' }]
    : []),
]);
const summaryLabel = computed(() => {
  const base =
    props.baseline && props.baselineMean !== undefined
      ? `, against baseline ${props.baselineId} centred on ${formatNumber(props.baselineMean, 0)}`
      : '';
  return `Histogram of DPS across ${formatNumber(props.total, 0)} iterations, mean ${formatNumber(props.mean, 0)}${base}.`;
});
</script>

<template>
  <UiPanel title="DPS distribution" :span="8">
    <template #meta>
      <ChartsLegend :items="legend">
        bin {{ formatNumber(binWidth, 1) }} DPS · n = {{ formatNumber(total, 0) }}
      </ChartsLegend>
    </template>
    <div class="view-toggle">
      <UiSegmentedControl
        v-model="view"
        label="View"
        hide-label
        size="sm"
        :options="[
          { value: 'chart', label: 'Chart' },
          { value: 'table', label: 'Table' },
        ]"
      />
    </div>
    <ChartsHistogram
      :bins="bins"
      :total="total"
      :baseline="baseline"
      :baseline-total="baselineTotal"
      :mean="mean"
      :baseline-mean="baseline ? baselineMean : undefined"
      :p5="p5"
      :p95="p95"
      :x-ticks="xTicks"
      :run-label="`Run ${runId}`"
      :baseline-label="`Baseline ${baselineId}`"
      :label="summaryLabel"
      :show-table="showTables || view === 'table'"
    />
  </UiPanel>
</template>

<style scoped>
.view-toggle {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-4) 0;
}
</style>
