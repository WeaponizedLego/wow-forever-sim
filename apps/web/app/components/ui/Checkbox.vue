<script setup lang="ts">
// Native checkbox with its label; accent is the primary-action ink, not a brand color.
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const checked = defineModel<boolean>({ default: false });
</script>

<template>
  <label class="check" :class="{ 'check--disabled': disabled }">
    <input v-model="checked" type="checkbox" :disabled="disabled" />
    <slot />
  </label>
</template>

<style scoped>
.check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-2);
  cursor: pointer;
}
.check:hover {
  color: var(--text-1);
}
input {
  accent-color: var(--action-bg);
  width: 14px;
  height: 14px;
  margin: 0;
}
.check--disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}
</style>
