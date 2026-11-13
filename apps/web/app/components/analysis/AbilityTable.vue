<script setup lang="ts">
// Damage by ability over all iterations. No ± column: the engine reports only totals per action, so
// there is no per-iteration spread to put an interval on.
import type { AbilityRow } from '@fsim/analysis';
import type { TableColumn, TableSort } from '~/composables/ui-types';

type Row = AbilityRow & { name: string };
const props = defineProps<{ rows: Row[] }>();

const cols: TableColumn<Row>[] = [
  { key: 'name', label: 'Ability', sortable: true },
  { key: 'dps', label: 'DPS', numeric: true, sortable: true },
  { key: 'share', label: 'Share', width: '18%', sortable: true },
  {
    key: 'cpm',
    label: 'CPM',
    numeric: true,
    tone: '2',
    sortable: true,
    sortValue: (r) => r.castsPerMinute ?? -1,
  },
  { key: 'avg', label: 'Avg hit', numeric: true, tone: '2', sortable: true, sortValue: (r) => r.avgHit },
  { key: 'crit', label: 'Crit', numeric: true, tone: '2', sortable: true, sortValue: (r) => r.critRate },
  { key: 'out', label: 'Outcomes', width: '24%' },
];
const sort = ref<TableSort | null>({ key: 'dps', dir: 'desc' });
const maxShare = computed(() => Math.max(0, ...props.rows.map((r) => r.share)));
const legend = [
  { label: 'Hit', mark: 'swatch', color: 'var(--series-1)' },
  { label: 'Crit', mark: 'swatch', color: 'var(--series-2)' },
  { label: 'Glance', mark: 'swatch', color: 'var(--series-3)' },
  { label: 'Miss / dodge', mark: 'swatch', color: 'var(--series-muted)' },
] as const;
const outcomes = (r: Row) => ({
  hit: r.outcomes.hit * 100,
  crit: r.outcomes.crit * 100,
  glance: r.outcomes.glance * 100,
  miss: r.outcomes.other * 100,
});
</script>

<template>
  <UiPanel title="Damage by ability" :span="8">
    <template #meta><ChartsLegend :items="[...legend]" /></template>
    <UiDataTable
      v-model:sort="sort"
      :columns="cols"
      :rows="rows"
      :row-key="(r) => `${r.petName ?? ''}|${r.key}`"
      caption="Damage by ability"
      min-width="720px"
    >
      <template #cell-name="{ row }">
        <span class="name">{{ row.name }}</span>
        <span v-if="row.basis === 'ticks'" class="tag">DoT</span>
      </template>
      <template #cell-dps="{ row }">{{ formatNumber(row.dps, 1) }}</template>
      <template #cell-share="{ row }">
        <ChartsInlineBar
          :value="row.share"
          :max="maxShare"
          :text="formatPercent(row.share, 1)"
          text-width="42px"
          class="text-2"
        />
      </template>
      <template #cell-cpm="{ row }">{{
        row.castsPerMinute === null ? '—' : formatNumber(row.castsPerMinute, 1)
      }}</template>
      <template #cell-avg="{ row }">{{ formatNumber(row.avgHit, 0) }}</template>
      <template #cell-crit="{ row }">{{ formatPercent(row.critRate, 1) }}</template>
      <template #cell-out="{ row }"
        ><ChartsStackedOutcomeBar :outcomes="outcomes(row)" :name="row.name"
      /></template>
    </UiDataTable>
    <p class="note">
      Per fight, averaged over all iterations. Avg hit and outcomes are for direct hits, or ticks for DoT-only
      rows. No per-ability ± is shown: the engine reports totals per ability, not per fight.
    </p>
  </UiPanel>
</template>

<style scoped>
.name {
  font-family: var(--font-sans);
  font-size: var(--text-md);
}
.tag {
  margin-left: 6px;
  font-size: var(--text-xs);
  color: var(--text-3);
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
