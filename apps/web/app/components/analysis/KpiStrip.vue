<script setup lang="ts">
// The five headline tiles of a run: mean ± CI, Δ vs baseline (Welch), spread, percentiles, precision.
import type { Summary, WelchResult } from '@fsim/analysis';

const props = defineProps<{
  summary: Summary;
  baseSummary: Summary | null;
  baselineId: string | null;
  welch: WelchResult | null;
  stableAfter: number | null;
}>();

const deltaPct = computed(() =>
  props.welch && props.baseSummary ? props.welch.delta / Math.abs(props.baseSummary.mean) : null,
);
const tone = computed(() =>
  !props.welch
    ? undefined
    : props.welch.verdict === 'better'
      ? 'up'
      : props.welch.verdict === 'worse'
        ? 'down'
        : 'noise',
);
const pText = computed(() => {
  const p = props.welch?.p;
  if (p === undefined) return '';
  return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`;
});
</script>

<template>
  <UiKpiTile
    label="Mean DPS · 95% CI"
    :value="formatNumber(summary.mean, 1)"
    :secondary="`± ${formatNumber(summary.ci95, 1)}`"
    :foot="`${formatNumber(summary.mean - summary.ci95, 1)} – ${formatNumber(summary.mean + summary.ci95, 1)}`"
    :span="3"
  />
  <UiKpiTile
    v-if="welch && baseSummary"
    :label="`Δ vs baseline ${baselineId}`"
    :value="formatSigned(welch.delta, 1)"
    :secondary="deltaPct === null ? undefined : `${formatSigned(deltaPct * 100, 1)}%`"
    :tone="tone"
    :span="3"
  >
    <template #foot>
      <UiStatusGlyph
        :status="welch.verdict === 'noise' ? 'info' : 'good'"
        :label="welch.verdict === 'noise' ? 'Within noise' : 'Significant'"
        class="text-2"
      />
      <span class="text-2"> · Welch t = {{ formatNumber(welch.t, 1) }}, {{ pText }}</span>
    </template>
  </UiKpiTile>
  <UiKpiTile v-else label="Δ vs baseline" value="—" :span="3">
    <template #foot><span class="text-3">No earlier run to compare with</span></template>
  </UiKpiTile>
  <UiKpiTile
    label="Spread (σ)"
    :value="formatNumber(summary.stdev, 1)"
    :foot="summary.cv === null ? undefined : `CV ${formatPercent(summary.cv, 1)}`"
    size="md"
    :span="2"
  >
    <template #label>Spread (<span class="lc">σ</span>)</template>
  </UiKpiTile>
  <UiKpiTile
    v-if="summary.percentiles"
    label="p5 – p95"
    :value="`${formatNumber(summary.percentiles.p5, 0)} – ${formatNumber(summary.percentiles.p95, 0)}`"
    :foot="`median ${formatNumber(summary.percentiles.median, 1)}`"
    size="md"
    :span="2"
  />
  <UiKpiTile v-else label="p5 – p95" value="—" foot="per-iteration values not saved" size="md" :span="2" />
  <UiKpiTile
    label="Precision"
    :value="`±${formatPercent(summary.ci95 / Math.abs(summary.mean || 1), 2)}`"
    size="md"
    :span="2"
  >
    <template #foot>
      <template v-if="stableAfter !== null">stable after {{ formatNumber(stableAfter, 0) }} it</template>
      <template v-else>not yet stable (±0.25%)</template>
    </template>
  </UiKpiTile>
</template>

<style scoped>
.text-2 {
  color: var(--text-2);
}
.text-3 {
  color: var(--text-3);
}
.lc {
  text-transform: none;
}
</style>
