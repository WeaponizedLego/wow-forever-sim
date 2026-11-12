<script setup lang="ts">
// One row of a forest plot: mean dot + 95% CI whisker on a shared axis, with a dashed reference
// line (e.g. the equipped set) that runs through the whole column. Lives in a table cell; the
// table's numeric columns are the accessible values, so the mark itself is a tooltip trigger only.
const props = withDefaults(
  defineProps<{
    mean: number;
    lo: number;
    hi: number;
    domain: [number, number];
    reference?: number;
    /** The reference row itself: dot in `referenceColor`. */
    isReference?: boolean;
    /** Identity color of the reference (dot and dashed line), e.g. 'var(--class-warrior)'. */
    referenceColor?: string;
    label: string;
    format?: (v: number) => string;
  }>(),
  {
    reference: undefined,
    isReference: false,
    referenceColor: 'var(--series-baseline)',
    format: (v: number) => formatNumber(v, 1),
  },
);
const at = (v: number) => clamp((v - props.domain[0]) / (props.domain[1] - props.domain[0] || 1), 0, 1);
const delta = computed(() => (props.reference === undefined ? undefined : props.mean - props.reference));
</script>

<template>
  <UiTooltip block>
    <template #default="{ describedby }">
      <span
        class="forest"
        tabindex="0"
        role="img"
        :aria-label="`${label}: ${format(mean)}, 95% CI ${format(lo)} to ${format(hi)}`"
        :aria-describedby="describedby"
        :style="{ '--ref': referenceColor }"
      >
        <span v-if="reference !== undefined" class="ref" :style="{ left: pct(at(reference)) }" />
        <span class="ci" :style="{ left: pct(at(lo)), width: pct(at(hi) - at(lo)) }" />
        <span class="dot" :class="{ 'dot--ref': isReference }" :style="{ left: pct(at(mean)) }" />
      </span>
    </template>
    <template #content>
      <div class="tip-title">{{ label }}</div>
      <ChartsTooltipRow label="Mean" :value="format(mean)" />
      <ChartsTooltipRow label="95% CI" :value="`${format(lo)} – ${format(hi)}`" />
      <ChartsTooltipRow
        v-if="delta !== undefined && !isReference"
        label="Δ vs reference"
        :value="formatSigned(delta, 1)"
      />
    </template>
  </UiTooltip>
</template>

<style scoped>
.forest {
  position: relative;
  display: block;
  width: 100%;
  height: 14px;
}
.forest:focus-visible {
  outline-offset: 3px;
}
.ref {
  position: absolute;
  top: -9px;
  bottom: -9px;
  border-left: 1px dashed color-mix(in srgb, var(--ref) 50%, var(--bg-panel));
}
.ci {
  position: absolute;
  top: 3px;
  height: 8px;
  border-left: 1px solid var(--series-baseline);
  border-right: 1px solid var(--series-baseline);
}
.ci::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 3px;
  height: 1px;
  background: var(--series-baseline);
}
.dot {
  position: absolute;
  top: 3px;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 4px;
  background: var(--text-1);
  box-shadow: 0 0 0 2px var(--bg-panel);
}
.dot--ref {
  background: var(--ref);
}
.tip-title {
  margin-bottom: var(--space-1);
  min-width: 160px;
}
</style>
