<script setup lang="ts">
// Per boss (or trash): how many of its drops are significant upgrades, and its best one. Answers "which
// boss is worth killing" at a glance.
import type { RankedRow } from '~/composables/topGear';
import type { TableColumn } from '~/composables/ui-types';

interface Row {
  name: string;
  items: number;
  upgrades: number;
  best: { itemId: number; row: RankedRow } | undefined;
}
defineProps<{ rows: Row[] }>();
const names = useActionNames();

const cols: TableColumn<Row>[] = [
  { key: 'name', label: 'Source' },
  { key: 'upgrades', label: 'Upgrades', numeric: true },
  { key: 'best', label: 'Best drop' },
];
</script>

<template>
  <UiPanel title="By boss" meta="significant upgrades">
    <UiDataTable :columns="cols" :rows="rows" :row-key="(r) => r.name" caption="Upgrades by boss">
      <template #cell-upgrades="{ row }"
        ><span :class="{ muted: !row.upgrades }">{{ row.upgrades }}/{{ row.items }}</span></template
      >
      <template #cell-best="{ row }">
        <span v-if="row.best" class="best">
          <UiQualityName :quality="names.itemQuality(row.best.itemId)">{{
            names.itemName(row.best.itemId)
          }}</UiQualityName>
          <UiDeltaValue :value="row.best.row.delta" :verdict="row.best.row.verdict" :glyph="false" />
        </span>
        <span v-else class="muted">—</span>
      </template>
    </UiDataTable>
  </UiPanel>
</template>

<style scoped>
.best {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
.muted {
  color: var(--text-3);
}
</style>
