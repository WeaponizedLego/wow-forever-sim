<script setup lang="ts">
import type { Quality } from '~/composables/ui-types';

// Static chip, e.g. one change in a top-gear combination: a mono slot tag then the name.
// `quality` colors the name (item names only).
withDefaults(defineProps<{ tag?: string; quality?: Quality | 'muted' }>(), {
  tag: undefined,
  quality: undefined,
});
</script>

<template>
  <span
    class="chip"
    :style="quality && { color: quality === 'muted' ? 'var(--text-2)' : `var(--quality-${quality})` }"
  >
    <span v-if="tag" class="num chip__tag">{{ tag }}</span>
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 var(--space-2);
  border: 1px solid var(--line-chip);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  font-size: var(--text-sm);
  white-space: nowrap;
}
.chip__tag {
  font-size: 10px;
  color: var(--text-3);
}
</style>
