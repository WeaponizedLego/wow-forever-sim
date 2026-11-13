<script setup lang="ts">
// Running mean ± 95% CI over iterations (log x), with the point the run became stable.
const props = defineProps<{
  points: { x: number; y: number; lo: number; hi: number }[];
  yDomain: [number, number];
  stableAfter: number | null;
  tolerance: number;
  showTables?: boolean;
}>();

const xDomain = computed<[number, number]>(() => [props.points[0]?.x ?? 1, props.points.at(-1)?.x ?? 2]);
const xTicks = computed(() => {
  const [a, b] = xDomain.value;
  const ticks: { value: number; label: string }[] = [];
  for (let p = 10 ** Math.ceil(Math.log10(a)); p < b; p *= 10)
    if (p / a > 1.6 && b / p > 2.5) ticks.push({ value: p, label: formatNumber(p, 0) });
  return [{ value: a, label: formatNumber(a, 0) }, ...ticks, { value: b, label: `${formatNumber(b, 0)} it` }];
});
const yTicks = computed(() => {
  const [lo, hi] = props.yDomain;
  return [lo, (lo + hi) / 2, hi];
});
const last = computed(() => props.points.at(-1));
const label = computed(() => {
  const p = props.points;
  const first = p[0];
  const end = last.value;
  if (!first || !end) return 'Convergence';
  return `Running mean settles at ${formatNumber(end.y, 0)}; the 95% band narrows from ±${formatNumber(first.hi - first.y, 0)} at ${formatNumber(first.x, 0)} iterations to ±${formatNumber(end.hi - end.y, 1)} at ${formatNumber(end.x, 0)}.`;
});
</script>

<template>
  <UiPanel title="Convergence" meta="running mean ± 95% CI" :span="4">
    <ChartsLineBand
      :points="points"
      x-scale="log"
      :x-domain="xDomain"
      :y-domain="yDomain"
      :y-ticks="yTicks"
      :x-ticks="xTicks"
      :marker="
        stableAfter !== null
          ? { x: stableAfter, label: `stable · ${formatNumber(stableAfter, 0)}` }
          : undefined
      "
      marker-align="left"
      :format-y="(v: number) => formatNumber(v, 0)"
      x-label="Iterations"
      y-label="Running mean"
      :label="label"
      :show-table="showTables"
    />
    <p class="note">
      Stable: from this point on the CI is within ±{{ formatPercent(tolerance, 2) }} of the mean and the mean
      stays within that of its final value.
    </p>
  </UiPanel>
</template>

<style scoped>
.note {
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
