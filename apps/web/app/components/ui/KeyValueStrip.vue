<script setup lang="ts">
import type { KeyValue } from '~/composables/ui-types';

// Row of label-over-value pairs (a <dl>). Labels are small caps sans, values mono.
withDefaults(defineProps<{ items: KeyValue[]; align?: 'start' | 'end' }>(), { align: 'start' });
</script>

<template>
  <dl class="num kv" :class="{ 'kv--end': align === 'end' }">
    <div v-for="item in items" :key="item.label">
      <dt class="label">{{ item.label }}</dt>
      <dd :class="item.tone && `tone-${item.tone}`">{{ item.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.kv {
  margin: 0;
  display: flex;
  gap: var(--space-2) 20px;
  flex-wrap: wrap;
  font-size: var(--text-xs);
}
.kv--end {
  text-align: right;
}
dt {
  font-family: var(--font-sans);
}
dd {
  margin: 0;
  white-space: nowrap;
}
.tone-up {
  color: var(--delta-up);
}
.tone-down {
  color: var(--delta-down);
}
</style>
