<script setup lang="ts">
// Combinations ranked by mean, each against the equipped set on one shared forest axis.
import type { RankedRow, GearChange } from '~/composables/topGear';
import type { TableColumn, TableSort } from '~/composables/ui-types';

const props = defineProps<{
  rows: RankedRow[];
  reference: number;
  domain: [number, number];
  ticks: number[];
  slotTag: (slot: GearChange['slot']) => string;
  baseIterations: number;
  equipping: boolean;
  /** The character's class color, for the equipped marker. */
  classColor: string;
}>();
const emit = defineEmits<{ equip: [row: RankedRow] }>();
const names = useActionNames();

const cols: TableColumn<RankedRow>[] = [
  { key: 'rank', label: '#', numeric: true, tone: '3', width: '28px' },
  { key: 'changes', label: 'Changes from equipped' },
  { key: 'mean', label: 'Mean', numeric: true, sortable: true },
  { key: 'delta', label: 'Δ', srLabel: 'Change vs equipped', numeric: true, sortable: true },
  { key: 'forest', label: 'Mean and 95% CI', width: '32%' },
  { key: 'verdict', label: 'Verdict' },
  { key: 'equip', label: '', srLabel: 'Equip', width: '64px' },
];
const sort = ref<TableSort | null>(null);
const rowLabel = (r: RankedRow) =>
  r.equipped ? 'Currently equipped' : r.changes.map((c) => names.itemName(c.itemId)).join(' + ');
</script>

<template>
  <!-- position + overflow: keeps the table's visually-hidden labels from widening the page on phones -->
  <div class="clip">
    <UiDataTable
      v-model:sort="sort"
      :columns="cols"
      :rows="rows"
      :row-key="(r) => r.key || 'equipped'"
      :row-state="(r) => (r.equipped ? 'reference' : undefined)"
      caption="Top gear ranking"
      min-width="900px"
      density="lg"
    >
      <template #head-forest>
        <span class="visually-hidden">Mean and 95% CI</span>
        <ChartsForestAxis :domain="domain" :ticks="ticks" />
      </template>
      <template #cell-changes="{ row }">
        <span class="chips">
          <UiChip v-if="row.equipped" tag="NOW" quality="muted">Currently equipped</UiChip>
          <UiChip
            v-for="c in row.changes"
            :key="c.slot"
            :tag="slotTag(c.slot)"
            :quality="names.itemQuality(c.itemId)"
            >{{ names.itemName(c.itemId) }}</UiChip
          >
        </span>
      </template>
      <template #cell-mean="{ row }">
        <span class="mean"
          ><span v-if="row.n !== baseIterations" class="it">{{ formatNumber(row.n / 1000, 0) }}k</span
          >{{ formatNumber(row.mean, 1) }}</span
        >
      </template>
      <template #cell-delta="{ row }">
        <span v-if="row.equipped" class="text-3">—</span>
        <UiDeltaValue v-else :value="row.delta" :verdict="row.verdict" :glyph="false" />
      </template>
      <template #cell-forest="{ row }">
        <ChartsForestRow
          :mean="row.mean"
          :lo="row.mean - row.ci95"
          :hi="row.mean + row.ci95"
          :domain="domain"
          :reference="reference"
          :is-reference="row.equipped"
          :reference-color="classColor"
          :label="rowLabel(row)"
        />
      </template>
      <template #cell-verdict="{ row }">
        <span v-if="row.equipped" class="equipped"
          ><span class="equipped__dot" aria-hidden="true">●</span>Equipped</span
        >
        <UiTooltip
          v-else
          :text="`|Δ| ${formatNumber(Math.abs(row.delta), 1)} vs noise floor ${formatNumber(row.noise, 1)}${row.p === null ? '' : ` · Welch p ${row.p < 0.001 ? '< 0.001' : `= ${row.p.toFixed(3)}`}`}`"
        >
          <UiDeltaValue :value="row.delta" :verdict="row.verdict" show-verdict hide-value />
        </UiTooltip>
      </template>
      <template #cell-equip="{ row }">
        <UiButton
          v-if="!row.equipped"
          size="sm"
          variant="quiet"
          :disabled="equipping"
          @click="emit('equip', row)"
          >Equip</UiButton
        >
      </template>
    </UiDataTable>
  </div>
</template>

<style scoped>
.clip {
  position: relative;
  overflow: hidden;
}
.chips {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.equipped {
  display: inline-flex;
  gap: 6px;
  color: var(--text-2);
}
.equipped__dot {
  color: v-bind(classColor);
}
.text-3 {
  color: var(--text-3);
}
.mean {
  white-space: nowrap;
}
.it {
  margin-right: 6px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
