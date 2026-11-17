<script setup lang="ts">
// Stat sheet differences (engine computeStats, buffs and consumables included): only the stats where a
// variant differs from A. A shows its value, the others their value and Δ.
import type { CompareEntry } from '~/composables/compare';
import type { TableColumn } from '~/composables/ui-types';
import type { CompareStatRow } from '~/utils/compare-rows';

const props = defineProps<{ entries: CompareEntry[]; rows: CompareStatRow[] }>();

const cols = computed<TableColumn<CompareStatRow>[]>(() => [
  { key: 'label', label: 'Stat', tone: '2' },
  ...props.entries.map((e, i) => ({
    key: `v${i}`,
    label: e.letter,
    srLabel: `${e.letter} ${e.name}`,
    numeric: true,
    ...(i === 0 && { tone: '3' as const }),
  })),
]);
const fmt = (r: CompareStatRow, v: number | null) =>
  v === null ? '—' : r.pct ? `${formatNumber(v, r.digits)}%` : formatNumber(v, r.digits);
const delta = (r: CompareStatRow, i: number) => {
  const v = r.values[i];
  const a = r.values[0];
  return v === null || v === undefined || a === null || a === undefined ? null : v - a;
};
const shown = (r: CompareStatRow, d: number | null) => d !== null && Math.abs(d) >= 10 ** -r.digits / 2;
</script>

<template>
  <UiDataTable :columns="cols" :rows="rows" :row-key="(r) => r.label" density="sm" caption="Stat differences">
    <template v-for="(e, i) in entries" :key="e.id" #[`cell-v${i}`]="{ row }">
      <span class="cell">
        {{ fmt(row, row.values[i] ?? null) }}
        <UiDeltaValue
          v-if="i > 0 && shown(row, delta(row, i))"
          class="d"
          :value="delta(row, i)!"
          :digits="row.digits"
          :glyph="false"
        />
      </span>
    </template>
  </UiDataTable>
</template>

<style scoped>
.cell {
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
  white-space: nowrap;
}
.d {
  font-size: var(--text-xs);
}
</style>
