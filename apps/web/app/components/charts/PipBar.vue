<script setup lang="ts">
// "n of N" as N equal cells, n filled (e.g. an item appears in 3 of the 5 significant wins).
const props = defineProps<{ count: number; total: number; label: string }>();
const cells = computed(() => Array.from({ length: props.total }, (_, i) => i < props.count));
</script>

<template>
  <span class="pips" role="img" :aria-label="`${label}: ${count} of ${total}`">
    <span v-for="(on, i) in cells" :key="i" class="pip" :class="{ 'pip--on': on }" />
  </span>
</template>

<style scoped>
.pips {
  display: flex;
  gap: 2px;
}
.pip {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-mark);
  background: var(--bg-pressed);
}
.pip--on {
  background: var(--series-1);
}
</style>
