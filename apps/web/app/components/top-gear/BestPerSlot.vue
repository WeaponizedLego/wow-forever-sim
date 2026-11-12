<script setup lang="ts">
// Per slot, the best candidate on its own (the single-change combinations).
import type { ItemSlotId } from '@fsim/contracts';
import type { RankedRow } from '~/composables/topGear';
import type { TableColumn } from '~/composables/ui-types';

const props = defineProps<{
  rows: { slot: ItemSlotId; row: RankedRow }[];
  slotLabel: (s: ItemSlotId) => string;
}>();
const names = useActionNames();

type Row = { slot: ItemSlotId; row: RankedRow };
const cols: TableColumn<Row>[] = [
  { key: 'slot', label: 'Slot', tone: '2' },
  { key: 'item', label: 'Best item' },
  { key: 'gain', label: 'Gain alone', numeric: true },
];
const noisy = computed(() =>
  props.rows.filter((r) => r.row.verdict === 'noise').map((r) => props.slotLabel(r.slot)),
);
</script>

<template>
  <UiPanel title="Best gain per slot" meta="alone">
    <UiDataTable
      :columns="cols"
      :rows="rows"
      :row-key="(r) => r.slot"
      hide-header
      caption="Best gain per slot"
    >
      <template #cell-slot="{ row }">{{ slotLabel(row.slot) }}</template>
      <template #cell-item="{ row }">
        <UiQualityName :quality="names.itemQuality(row.row.changes[0]!.itemId)">{{
          names.itemName(row.row.changes[0]!.itemId)
        }}</UiQualityName>
      </template>
      <template #cell-gain="{ row }"
        ><UiDeltaValue :value="row.row.delta" :verdict="row.row.verdict" :glyph="false"
      /></template>
    </UiDataTable>
    <p v-if="noisy.length" class="note">
      {{ noisy.join(', ') }} alone {{ noisy.length === 1 ? 'sits' : 'sit' }} inside the noise floor. Re-run
      the top combinations at 25k before trusting small gains.
    </p>
  </UiPanel>
</template>

<style scoped>
.note {
  margin: 0;
  padding: 10px var(--space-4) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
