<script setup lang="ts">
import type { Status } from '~/composables/ui-types';

// Status icon + label. Status color never appears without the icon; with `hideLabel` the label is
// still read by screen readers.
const props = withDefaults(defineProps<{ status: Status; label?: string; hideLabel?: boolean }>(), {
  label: undefined,
  hideLabel: false,
});
const fallback: Record<Status, string> = { good: 'OK', warning: 'Warning', info: 'Info' };
const text = computed(() => props.label ?? fallback[props.status]);
</script>

<template>
  <span class="glyph" :class="`glyph--${status}`">
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" class="glyph__icon">
      <path
        v-if="status === 'good'"
        d="M3 7.4l2.6 2.6L11.2 4.2"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <template v-else-if="status === 'warning'">
        <path
          d="M7 1.5L13 12.5H1Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
        <path d="M7 5.5v3.2M7 10.2v.6" stroke="currentColor" stroke-width="1.4" />
      </template>
      <template v-else>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path d="M7 6.2v3.8M7 4.1v.6" stroke="currentColor" stroke-width="1.4" />
      </template>
    </svg>
    <span :class="hideLabel ? 'visually-hidden' : 'glyph__label'"
      ><slot>{{ text }}</slot></span
    >
  </span>
</template>

<style scoped>
.glyph {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.glyph__icon {
  flex-shrink: 0;
}
.glyph--good .glyph__icon {
  color: var(--status-good);
}
.glyph--warning .glyph__icon {
  color: var(--status-warning);
}
.glyph--info .glyph__icon {
  color: var(--status-info);
}
.glyph__label {
  color: inherit;
}
</style>
