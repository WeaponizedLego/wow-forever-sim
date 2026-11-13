<script setup lang="ts">
import type { LegendItem } from '~/composables/ui-types';

// Chart legend for a panel header. Marks carry the color; labels stay in text tokens.
// Trailing slot for mono meta ("bin 15.5 DPS · n = 5,000").
defineProps<{ items: LegendItem[] }>();
</script>

<template>
  <div class="legend">
    <span v-for="item in items" :key="item.label" class="legend__item">
      <span
        class="mark"
        :class="`mark--${item.mark}`"
        :style="{ '--c': item.color ?? 'var(--text-2)' }"
        aria-hidden="true"
      />
      {{ item.label }}
    </span>
    <span v-if="$slots.default" class="num legend__meta"><slot /></span>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: var(--text-xs);
  color: var(--text-2);
}
.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.legend__meta {
  color: var(--text-3);
}
.mark {
  display: inline-block;
  flex-shrink: 0;
}
.mark--swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--c);
}
.mark--line {
  width: 12px;
  height: 2px;
  background: var(--c);
}
.mark--dashed {
  width: 12px;
  border-top: 1.5px dashed var(--c);
}
.mark--band {
  width: 12px;
  height: 8px;
  background: var(--c);
  opacity: 0.25;
}
.mark--dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--c);
}
.mark--whisker {
  width: 14px;
  height: 6px;
  border-left: 1px solid var(--c);
  border-right: 1px solid var(--c);
  background: linear-gradient(var(--c), var(--c)) center / 100% 1px no-repeat;
}
.mark--vline {
  width: 0;
  height: 10px;
  border-left: 1px dashed var(--c);
}
@media (max-width: 640px) {
  .legend {
    justify-content: flex-start;
  }
}
</style>
