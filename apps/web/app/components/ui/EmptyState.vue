<script setup lang="ts">
// What a panel shows before there is data. Says what is missing and the one action that fills it.
withDefaults(defineProps<{ title: string; body?: string }>(), { body: undefined });
</script>

<template>
  <div class="empty">
    <p class="empty__title">{{ title }}</p>
    <p v-if="body" class="empty__body">{{ body }}</p>
    <div v-if="$slots.default" class="empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  padding: var(--space-6) var(--space-4);
  border-top: 1px dashed var(--line-control);
  border-bottom: 1px dashed var(--line-control);
  margin: var(--space-4);
}
.empty__title {
  margin: 0;
  font-weight: 500;
}
.empty__body {
  margin: var(--space-1) 0 0;
  max-width: 56ch;
  color: var(--text-2);
}
.empty__actions {
  display: flex;
  gap: 6px;
  margin-top: var(--space-3);
}
</style>
