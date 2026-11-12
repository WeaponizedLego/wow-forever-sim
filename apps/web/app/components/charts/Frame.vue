<script setup lang="ts">
// Shared layout for x/y charts: HTML y-axis labels in a left column, the plot (measured, so the SVG
// can draw in real pixels), HTML x-axis labels below. Axis text is HTML so it never scales.
// Slot props: { width, height } of the plot box.
const props = withDefaults(
  defineProps<{
    height: number;
    /** y labels: `at` is px from the plot top. */
    yTicks?: { at: number; label: string }[];
    /** x labels: `at` is 0–1 across the plot. */
    xTicks?: { at: number; label: string }[];
    /** Text in the axis column instead of ticks, e.g. "Rage". */
    axisTitle?: string;
    axisWidth?: number;
    axisGap?: number;
    pad?: string;
    /** Align y labels left (lane-style label column) instead of right. */
    axisAlign?: 'left' | 'right';
  }>(),
  {
    yTicks: () => [],
    xTicks: () => [],
    axisTitle: undefined,
    axisWidth: 34,
    axisGap: 8,
    pad: '18px 18px 8px 10px',
    axisAlign: 'right',
  },
);
const plot = ref<HTMLElement | null>(null);
const width = useChartWidth(plot);
defineExpose({ width });

// Labels at the plot's top and bottom edges stay inside it.
function yAlign(at: number) {
  if (at <= 4) return 'translateY(-2px)';
  if (at >= props.height - 4) return 'translateY(calc(-100% + 2px))';
  return 'translateY(-50%)';
}
// Thin out x labels when they would crowd (about 52px per label).
const shownX = computed(() => {
  const step = Math.max(1, Math.ceil((props.xTicks.length * 52) / Math.max(1, width.value)));
  return props.xTicks.filter((_, i) => i % step === 0);
});
function xAlign(at: number) {
  if (at <= 0.02) return 'translateX(0)';
  if (at >= 0.98) return 'translateX(-100%)';
  return 'translateX(-50%)';
}
</script>

<template>
  <div class="frame" :style="{ padding: pad, '--axis-w': `${axisWidth}px`, columnGap: `${axisGap}px` }">
    <div
      class="num yaxis"
      :class="`yaxis--${axisAlign}`"
      :style="{ height: `${height}px` }"
      aria-hidden="true"
    >
      <span v-if="axisTitle" class="yaxis__title">{{ axisTitle }}</span>
      <span
        v-for="t in props.yTicks"
        :key="t.at"
        class="yaxis__tick"
        :style="{ top: `${t.at}px`, transform: yAlign(t.at) }"
        >{{ t.label }}</span
      >
    </div>
    <div ref="plot" class="plot" :style="{ height: `${height}px` }">
      <slot :width="width" :height="height" />
    </div>
    <template v-if="xTicks.length">
      <div />
      <div class="num xaxis" aria-hidden="true">
        <span
          v-for="t in shownX"
          :key="t.label"
          class="xaxis__tick"
          :style="{ left: `${t.at * 100}%`, transform: xAlign(t.at) }"
          >{{ t.label }}</span
        >
      </div>
    </template>
  </div>
</template>

<style scoped>
.frame {
  display: grid;
  grid-template-columns: var(--axis-w) minmax(0, 1fr);
}
/* Wide label columns (lane names) shrink on phones so the plot keeps most of the width. */
@media (max-width: 640px) {
  .frame {
    grid-template-columns: min(var(--axis-w), 92px) minmax(0, 1fr);
  }
}
.yaxis {
  position: relative;
  font-size: 10px;
  color: var(--text-3);
}
.yaxis--right {
  text-align: right;
}
.yaxis__tick {
  position: absolute;
  right: 0;
  white-space: nowrap;
  line-height: 1;
}
.yaxis--left .yaxis__tick {
  left: 0;
  right: auto;
}
.yaxis__title {
  display: block;
  padding-top: 6px;
}
.plot {
  position: relative;
  min-width: 0;
}
.xaxis {
  position: relative;
  height: 20px;
  margin-top: var(--space-1);
  font-size: 10px;
  color: var(--text-3);
}
.xaxis__tick {
  position: absolute;
  top: 0;
  white-space: nowrap;
}
</style>
