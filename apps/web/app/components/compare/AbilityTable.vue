<script setup lang="ts">
// Compact ability breakdown across variants: DPS per ability for A, and each other variant's Δ.
// No per-ability error bars: the engine reports totals only (see @fsim/analysis abilities).
import type { CompareEntry } from '~/composables/compare';
import type { TableColumn } from '~/composables/ui-types';
import type { CompareAbilityRow } from '~/utils/compare-rows';

const props = defineProps<{ entries: CompareEntry[]; rows: CompareAbilityRow[] }>();
const names = useActionNames();

interface Row extends CompareAbilityRow {
  name: string;
}
const rows = computed<Row[]>(() => {
  const n = names.distinctNames(props.rows.map((r) => r.id));
  return props.rows.map((r, i) => ({ ...r, name: n[i]! }));
});
const max = computed(() => Math.max(1, ...props.rows.flatMap((r) => r.dps.map((v) => v ?? 0))));
const cols = computed<TableColumn<Row>[]>(() => [
  { key: 'name', label: 'Ability' },
  ...props.entries.map((e, i) => ({
    key: `v${i}`,
    label: i === 0 ? `${e.letter} DPS` : `${e.letter} Δ`,
    srLabel: i === 0 ? `${e.letter} ${e.name} DPS` : `${e.letter} ${e.name} change vs A`,
    numeric: true,
    ...(i === 0 && { width: '170px' }),
  })),
]);
/** Every variant after A, with its table slot (a dynamic slot name cannot hold an expression with spaces). */
const others = computed(() =>
  props.entries.slice(1).map((e, i) => ({ id: e.id, index: i + 1, slot: `cell-v${i + 1}` })),
);
const delta = (r: Row, i: number) => {
  const v = r.dps[i];
  const a = r.dps[0];
  return v === null || v === undefined || a === null || a === undefined ? null : v - a;
};
</script>

<template>
  <UiDataTable
    :columns="cols"
    :rows="rows"
    :row-key="(r) => r.key"
    density="sm"
    caption="Ability DPS by variant"
    min-width="520px"
  >
    <template #cell-v0="{ row }">
      <ChartsInlineBar
        v-if="row.dps[0] !== null"
        :value="row.dps[0] ?? 0"
        :max="max"
        :text="formatNumber(row.dps[0] ?? 0, 1)"
        text-width="56px"
      />
    </template>
    <template v-for="o in others" :key="o.id" #[o.slot]="{ row }">
      <template v-if="delta(row, o.index) !== null">
        <UiDeltaValue
          v-if="Math.abs(delta(row, o.index)!) >= 0.05"
          :value="delta(row, o.index)!"
          :glyph="false"
          verdict="noise"
        />
        <span v-else class="zero">0</span>
      </template>
      <span v-else class="zero">—</span>
    </template>
  </UiDataTable>
</template>

<style scoped>
.zero {
  color: var(--text-3);
}
</style>
