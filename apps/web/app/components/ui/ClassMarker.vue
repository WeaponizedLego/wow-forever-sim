<script setup lang="ts">
import type { ClassId } from '@fsim/contracts';

// Class identity marker: a thin vertical bar. Class color is never used as a fill anywhere else.
// lg: 4×28 next to page titles · md: 3×10 inline in lists and tables · stretch: 3px, full height of its row.
withDefaults(defineProps<{ cls: ClassId; size?: 'lg' | 'md' | 'stretch' }>(), { size: 'md' });
</script>

<template>
  <span
    class="marker"
    :class="`marker--${size}`"
    :style="{ background: `var(--class-${cls})` }"
    aria-hidden="true"
  />
</template>

<style scoped>
.marker {
  display: inline-block;
  flex-shrink: 0;
  border-radius: var(--radius-mark);
}
.marker--lg {
  width: 4px;
  height: 28px;
}
.marker--md {
  width: 3px;
  height: 10px;
}
.marker--stretch {
  width: 3px;
  align-self: stretch;
}
</style>
