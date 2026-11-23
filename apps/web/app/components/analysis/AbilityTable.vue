<script setup lang="ts">
// Damage by ability over all iterations. No ± column: the engine reports only totals per action, so
// there is no per-iteration spread to put an interval on.
import type { AbilityRow } from '@fsim/analysis';
import type { TableColumn, TableSort } from '~/composables/ui-types';

type Row = AbilityRow & { name: string; icon?: string | null };
const props = defineProps<{ rows: Row[] }>();

const cols: TableColumn<Row>[] = [
  { key: 'name', label: 'Ability', sortable: true },
  { key: 'dps', label: 'DPS', numeric: true, sortable: true },
  { key: 'share', label: 'Share', width: '18%', sortable: true },
  {
    key: 'cpm',
    label: 'Casts/min',
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
/** Icons come from Wowhead's CDN; offline, the row keeps its name and drops the icon. */
const failedIcons = ref(new Set<string>());
/** Rows without an icon (Melee) keep a blank so names line up, while any row shows one. */
const hasIcons = computed(() => props.rows.some((r) => r.icon && !failedIcons.value.has(r.icon)));
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
        <img
          v-if="row.icon && !failedIcons.has(row.icon)"
          :src="row.icon"
          class="icon"
          alt=""
          width="16"
          height="16"
          loading="lazy"
          @error="failedIcons.add(row.icon)"
        />
        <span v-else-if="hasIcons" class="icon" aria-hidden="true" />
        <span class="name">{{ row.name }}</span>
        <!-- The space is in the text, so the row reads "Corruption DoT" to a screen reader and when copied. A name
             that already says it ("Pyroblast (DoT)") gets no second tag. -->
        <span v-if="row.basis === 'ticks' && !row.name.includes('(DoT')" class="tag">&#32;DoT</span>
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
.icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  vertical-align: -3px;
  border-radius: 2px;
}
.name {
  font-family: var(--font-sans);
  font-size: var(--text-md);
}
.tag {
  margin-left: 3px;
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
