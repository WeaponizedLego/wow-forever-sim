<script setup lang="ts">
// Relative uncertainty of one estimate (a stat weight): dot at the center, whisker = ±CI as % of the
// value, scaled so `max`% reaches the cell edge. A reference row (rel 0) is a dot only.
// The row's numbers are in neighbouring cells; the mark is a tooltip trigger.
const props = withDefaults(
  defineProps<{
    /** CI half-width as a percentage of the value. */
    rel: number;
    max?: number;
    label: string;
    valueText?: string;
    ciText?: string;
  }>(),
  { max: 25, valueText: undefined, ciText: undefined },
);
const half = computed(() => (Math.min(props.rel, props.max) / props.max) * 50);
</script>

<template>
  <UiTooltip block>
    <template #default="{ describedby }">
      <span
        class="wd"
        tabindex="0"
        role="img"
        :aria-label="`${label}: CI ±${formatNumber(rel, 1)}% of the value`"
        :aria-describedby="describedby"
      >
        <span class="track" />
        <span v-if="rel > 0" class="ci" :style="{ left: `${50 - half}%`, width: `${half * 2}%` }" />
        <span class="dot" />
      </span>
    </template>
    <template #content>
      <div class="tip-title">{{ label }}</div>
      <ChartsTooltipRow v-if="valueText" label="Weight" :value="valueText" />
      <ChartsTooltipRow v-if="ciText" label="95% CI" :value="ciText" />
      <ChartsTooltipRow label="CI / weight" :value="rel > 0 ? `±${formatNumber(rel, 1)}%` : 'reference'" />
    </template>
  </UiTooltip>
</template>

<style scoped>
.wd {
  position: relative;
  display: block;
  width: 100%;
  height: 10px;
}
.wd:focus-visible {
  outline-offset: 3px;
}
.track {
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--line-subtle);
}
.ci {
  position: absolute;
  top: 2px;
  height: 6px;
  border-left: 1px solid var(--series-baseline);
  border-right: 1px solid var(--series-baseline);
}
.ci::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 2px;
  height: 1px;
  background: var(--series-baseline);
}
.dot {
  position: absolute;
  top: 1px;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 4px;
  background: var(--text-1);
  box-shadow: 0 0 0 2px var(--bg-panel);
}
.tip-title {
  margin-bottom: var(--space-1);
  min-width: 150px;
}
</style>
