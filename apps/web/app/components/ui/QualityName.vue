<script setup lang="ts">
import type { Quality } from '~/composables/ui-types';

// Item name in its quality color. Quality colors appear on item names and nowhere else.
// `missing` marks an item the data build does not know (warning color, with a hidden label).
withDefaults(defineProps<{ quality?: Quality; to?: string; missing?: boolean }>(), {
  quality: 'common',
  to: undefined,
  missing: false,
});
</script>

<template>
  <component
    :is="to ? 'a' : 'span'"
    :href="to"
    class="qname"
    :style="{ color: missing ? 'var(--status-warning)' : `var(--quality-${quality})` }"
  >
    <span v-if="missing" class="visually-hidden">Unknown item:</span>
    <slot />
  </component>
</template>

<style scoped>
.qname {
  text-decoration: none;
}
a.qname:hover {
  text-decoration: underline;
  text-decoration-color: currentColor;
}
</style>
