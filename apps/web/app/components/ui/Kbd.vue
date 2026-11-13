<script setup lang="ts">
// Keyboard shortcut hint, e.g. ⌘K in a search field or ⌘↵ on the primary button.
withDefaults(defineProps<{ keys: string; inverted?: boolean }>(), { inverted: false });
</script>

<template>
  <kbd class="num kbd" :class="{ 'kbd--inverted': inverted }">{{ keys }}</kbd>
</template>

<style scoped>
.kbd {
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
  border: 1px solid var(--line-control);
  border-radius: 2px;
  color: var(--text-3);
  white-space: nowrap;
}
.kbd--inverted {
  border: 0;
  padding: 0;
  color: var(--text-disabled);
}
</style>
