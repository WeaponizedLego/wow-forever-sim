<script setup lang="ts">
// One tile of UiPanelGrid: header (title left; meta, legend or a control right) and a body.
// `meta` is plain mono text; for anything richer use the #meta slot.
const props = withDefaults(
  defineProps<{
    title: string;
    span?: number;
    rowSpan?: number;
    meta?: string;
    /** Pads the body with the panel padding. Off by default: tables and charts set their own. */
    padded?: boolean;
  }>(),
  { span: 12, rowSpan: 1, meta: undefined, padded: false },
);
const id = useId();
const style = computed(() => gridCellStyle(props.span, props.rowSpan));
</script>

<template>
  <section class="panel" :style="style" :aria-labelledby="id">
    <div class="panel__head">
      <h2 :id="id" class="panel__title">{{ title }}</h2>
      <div v-if="$slots.meta || meta" class="panel__meta">
        <slot name="meta"
          ><span class="num">{{ meta }}</span></slot
        >
      </div>
    </div>
    <div :class="{ panel__body: padded }"><slot /></div>
    <slot name="footer" />
  </section>
</template>

<style scoped>
.panel {
  grid-column: span var(--span);
  grid-row: span var(--row-span);
  background: var(--bg-panel);
  min-width: 0;
}
.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--line-seam);
}
.panel__title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-1);
  white-space: nowrap;
}
.panel__meta {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
  text-align: right;
}
.panel__body {
  padding: var(--space-4);
}
@media (max-width: 1100px) {
  .panel {
    grid-column: span var(--span-md);
    grid-row: auto;
  }
}
@media (max-width: 640px) {
  .panel {
    grid-column: 1 / -1;
  }
  .panel__head {
    flex-wrap: wrap;
  }
  .panel__meta {
    text-align: left;
  }
}
</style>
