<script setup lang="ts">
// How many of the significant wins each candidate item is part of.
defineProps<{ total: number; items: { itemId: number; n: number }[] }>();
const names = useActionNames();
</script>

<template>
  <UiPanel title="Items in significant wins" :meta="`${total} combo${total === 1 ? '' : 's'}`">
    <ul v-if="total > 0" class="wins">
      <li v-for="w in items" :key="w.itemId">
        <div class="wins__head">
          <UiQualityName :quality="names.itemQuality(w.itemId)">{{ names.itemName(w.itemId) }}</UiQualityName>
          <span class="num text-2">{{ w.n }}/{{ total }}</span>
        </div>
        <ChartsPipBar :count="w.n" :total="total" :label="names.itemName(w.itemId)" />
      </li>
    </ul>
    <p v-else class="note">No combination beats the equipped set by more than the noise floor.</p>
  </UiPanel>
</template>

<style scoped>
.wins {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wins__head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
  margin-bottom: 5px;
}
.text-2 {
  color: var(--text-2);
}
.note {
  margin: 0;
  padding: 10px var(--space-4) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
