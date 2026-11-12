<script setup lang="ts">
// Toggle chip for filters (aria-pressed). On = inverted, like the primary action.
withDefaults(defineProps<{ count?: number | string }>(), { count: undefined });
const on = defineModel<boolean>({ default: false });
</script>

<template>
  <button type="button" class="fchip" :aria-pressed="on" @click="on = !on">
    <slot />
    <template v-if="count !== undefined">
      <span aria-hidden="true">·</span><span class="num">{{ count }}</span>
    </template>
  </button>
</template>

<style scoped>
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-2);
  font-size: var(--text-sm);
  cursor: pointer;
  white-space: nowrap;
}
.fchip:hover {
  color: var(--text-1);
}
.fchip[aria-pressed='true'] {
  border-color: var(--action-bg);
  background: var(--action-bg);
  color: var(--action-fg);
}
</style>
