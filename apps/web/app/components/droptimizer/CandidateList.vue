<script setup lang="ts">
// The drops a run will sim, one row per item: the slots it is tried in, who drops it, and what changes
// besides the item (enchant, off hand).
import { ITEM_SLOTS, type ItemSlotId } from '@fsim/contracts';
import type { DropCandidate, DropFlag } from '~/composables/droptimizer';
import type { TableColumn } from '~/composables/ui-types';

const props = defineProps<{ candidates: DropCandidate[] }>();
const names = useActionNames();

interface Row {
  itemId: number;
  slots: ItemSlotId[];
  sources: string[];
  flags: DropFlag[];
}
const rows = computed<Row[]>(() => {
  const byItem = new Map<number, Row>();
  for (const c of props.candidates) {
    const row = byItem.get(c.itemId);
    if (row) {
      row.slots.push(c.slot);
      for (const f of c.flags) if (!row.flags.includes(f)) row.flags.push(f);
    } else
      byItem.set(c.itemId, { itemId: c.itemId, slots: [c.slot], sources: c.sources, flags: [...c.flags] });
  }
  return [...byItem.values()].sort(
    (a, b) =>
      ITEM_SLOTS.indexOf(a.slots[0]!) - ITEM_SLOTS.indexOf(b.slots[0]!) ||
      names.itemName(a.itemId).localeCompare(names.itemName(b.itemId)),
  );
});
const cols: TableColumn<Row>[] = [
  { key: 'slots', label: 'Slot', tone: '2', width: '150px' },
  { key: 'item', label: 'Item' },
  { key: 'sources', label: 'Drops from', tone: '2' },
  { key: 'flags', label: 'Notes', tone: '3' },
];
</script>

<template>
  <UiDataTable
    :columns="cols"
    :rows="rows"
    :row-key="(r) => r.itemId"
    caption="Drops to sim"
    max-height="420px"
    min-width="640px"
  >
    <template #cell-slots="{ row }">{{
      row.slots.map((s) => TOP_GEAR_SLOT_LABELS[s]).join(' or ')
    }}</template>
    <template #cell-item="{ row }">
      <UiQualityName :quality="names.itemQuality(row.itemId)">{{ names.itemName(row.itemId) }}</UiQualityName>
    </template>
    <template #cell-sources="{ row }">{{ row.sources.join(', ') }}</template>
    <template #cell-flags="{ row }">{{ row.flags.map((f) => DROP_FLAG_LABELS[f]).join(' · ') }}</template>
  </UiDataTable>
</template>
