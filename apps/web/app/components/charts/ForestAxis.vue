<script setup lang="ts">
// Tick labels for a column of ForestRow marks (put it in that column's header cell).
const props = withDefaults(
  defineProps<{ domain: [number, number]; ticks: number[]; format?: (v: number) => string }>(),
  { format: (v: number) => formatNumber(v, 0) },
);
const at = (v: number) => clamp((v - props.domain[0]) / (props.domain[1] - props.domain[0] || 1), 0, 1);
function xAlign(f: number) {
  if (f <= 0.02) return 'translateX(0)';
  if (f >= 0.98) return 'translateX(-100%)';
  return 'translateX(-50%)';
}
</script>

<template>
  <span class="num axis" aria-hidden="true">
    <span v-for="t in ticks" :key="t" class="tick" :style="{ left: pct(at(t)), transform: xAlign(at(t)) }">{{
      format(t)
    }}</span>
  </span>
</template>

<style scoped>
.axis {
  position: relative;
  display: block;
  height: 1.45em;
  font-size: var(--text-xs);
  color: var(--text-3);
  text-transform: none;
  letter-spacing: 0;
}
.tick {
  position: absolute;
  top: 0;
  white-space: nowrap;
}
</style>
