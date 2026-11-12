<script setup lang="ts">
// A column of panels inside UiPanelGrid that shares one span, e.g. weights over hit scaling.
// Inner panels should keep the default span (12).
const props = withDefaults(defineProps<{ span?: number; rowSpan?: number; fill?: boolean }>(), {
  span: 4,
  rowSpan: 1,
  fill: false,
});
const style = computed(() => gridCellStyle(props.span, props.rowSpan));
</script>

<template>
  <div class="stack" :class="{ 'stack--fill': fill }" :style="style"><slot /></div>
</template>

<style scoped>
.stack {
  grid-column: span var(--span);
  grid-row: span var(--row-span);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1px;
  align-content: start;
  background: var(--line-seam);
  min-width: 0;
}
/* Last panel grows so the stack has no seam-colored gap at the bottom. */
.stack--fill {
  align-content: stretch;
  grid-auto-rows: auto;
}
.stack--fill > :deep(:last-child) {
  height: 100%;
}
@media (max-width: 1100px) {
  .stack {
    grid-column: span var(--span-md);
    grid-row: auto;
  }
}
@media (max-width: 640px) {
  .stack {
    grid-column: 1 / -1;
  }
}
</style>
