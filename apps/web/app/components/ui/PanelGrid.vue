<script setup lang="ts">
// 12-column grid of tiled panels separated by 1px seams (the seam is the grid background showing
// through a 1px gap). Children: UiPanel, UiKpiTile, UiPanelStack, each with a `span`.
</script>

<template>
  <div class="grid"><slot /></div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1px;
  background: var(--line-seam);
  border: 1px solid var(--line-seam);
}
</style>
