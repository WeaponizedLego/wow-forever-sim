<script setup lang="ts">
// Tooltip at a data point inside a chart's plot box (position: relative). Sits right of `x`, flips
// left near the right edge. Rows: <ChartsTooltipRow label value />, or anything in the slot.
const props = withDefaults(
  defineProps<{ x: number; y?: number; width: number; title?: string; boxWidth?: number }>(),
  { y: 0, title: undefined, boxWidth: 176 },
);
const style = computed(() => {
  const gap = 12;
  const flip = props.x + gap + props.boxWidth > props.width;
  const side = flip
    ? { right: `${Math.max(0, props.width - props.x + gap)}px` }
    : { left: `${props.x + gap}px` };
  return { ...side, top: `${props.y}px`, minWidth: `${props.boxWidth}px` };
});
</script>

<template>
  <div class="ctip" :style="style" aria-hidden="true">
    <div v-if="title" class="num ctip__title">{{ title }}</div>
    <slot />
  </div>
</template>

<style scoped>
.ctip {
  position: absolute;
  z-index: 10;
  padding: var(--space-2) 10px;
  background: var(--bg-raised);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-tooltip);
  box-shadow: var(--shadow-tooltip);
  font-size: var(--text-xs);
  white-space: nowrap;
  pointer-events: none;
}
.ctip__title {
  color: var(--text-1);
  margin-bottom: var(--space-1);
}
</style>
