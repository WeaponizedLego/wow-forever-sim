<script setup lang="ts">
// Combinations ranked by mean, each against the equipped set on one shared forest axis.
// After a re-run at more iterations, the Δ column splits in two: "Quick pass Δ" (muted, the first pass, against the
// first-pass equipped set) and "Final Δ (10k)" (the re-run rows only), so it is plain which number to go by.
// Every verdict is a Welch test at the row's own pass (utils/ranking.ts): rows that were not re-run keep their
// quick-pass verdict and say "not re-run" in the final column, and the note above gives each pass's noise floor.
import { iterationsLabel, passNoiseFloors, type RankedRow, type GearChange } from '~/utils/ranking';
import type { TableColumn, TableSort } from '~/composables/ui-types';

const props = withDefaults(
  defineProps<{
    rows: RankedRow[];
    reference: number;
    domain: [number, number];
    ticks: number[];
    slotTag: (slot: GearChange['slot']) => string;
    baseIterations: number;
    equipping: boolean;
    /** The character's class color, for the equipped marker. */
    classColor: string;
    /** The table's accessible name. */
    caption?: string;
  }>(),
  { caption: 'Top gear ranking' },
);
// #detail (optional): extra line under a row's change chips, e.g. where a drop comes from.
const emit = defineEmits<{ equip: [row: RankedRow] }>();
const names = useActionNames();

/** Iterations of the re-run, when any row was re-run. */
const rerunN = computed(() => props.rows.find((r) => r.rerun)?.n ?? null);
const rerunLabel = computed(() => (rerunN.value === null ? '' : iterationsLabel(rerunN.value)));
const floors = computed(() => passNoiseFloors(props.rows));
const verdictTip = (r: RankedRow) =>
  `${r.rerun || rerunN.value === null ? '' : `Quick pass, ${formatNumber(r.n, 0)} it: `}|Δ| ${formatNumber(Math.abs(r.delta), 1)} vs noise floor ${formatNumber(r.noise, 1)}${r.p === null ? '' : ` · Welch p ${r.p < 0.001 ? '< 0.001' : `= ${r.p.toFixed(3)}`}`}`;

const cols = computed<TableColumn<RankedRow>[]>(() => [
  { key: 'rank', label: '#', numeric: true, tone: '3', width: '28px' },
  { key: 'changes', label: 'Changes from equipped' },
  { key: 'mean', label: 'Mean', numeric: true, sortable: true },
  ...(rerunN.value === null
    ? [{ key: 'delta', label: 'Δ', srLabel: 'Change vs equipped', numeric: true, sortable: true }]
    : [
        {
          key: 'quick',
          label: 'Quick pass Δ',
          srLabel: `Quick pass change vs equipped, ${formatNumber(props.baseIterations, 0)} iterations`,
          numeric: true,
          tone: '3' as const,
          sortable: true,
          sortValue: (r: RankedRow) => r.quickDelta,
        },
        {
          key: 'delta',
          label: `Final Δ (${rerunLabel.value})`,
          srLabel: `Final change vs equipped, ${formatNumber(rerunN.value, 0)} iterations`,
          numeric: true,
          sortable: true,
          sortValue: (r: RankedRow) => (r.rerun ? r.delta : -Infinity),
        },
      ]),
  { key: 'forest', label: 'Mean and 95% CI', width: '32%' },
  { key: 'verdict', label: 'Verdict' },
  { key: 'equip', label: '', srLabel: 'Equip', width: '64px' },
]);
const sort = ref<TableSort | null>(null);
const rowLabel = (r: RankedRow) =>
  r.equipped ? 'Currently equipped' : r.changes.map((c) => names.itemName(c.itemId)).join(' + ');
</script>

<template>
  <!-- position + overflow: keeps the table's visually-hidden labels from widening the page on phones -->
  <p v-if="rerunN !== null" class="rerun-note" data-testid="rerun-note">
    Rows tagged {{ rerunLabel }} were re-run at {{ formatNumber(rerunN, 0) }} iterations: their mean and
    <strong>Final Δ</strong> are the numbers to go by. Quick pass Δ is the first pass at
    {{ formatNumber(baseIterations, 0) }} iterations, kept for comparison; rows not re-run keep only that.
    Verdicts are a Welch test at each pass's own iterations, against the equipped set simmed the same way:
    <span class="num"
      >{{ formatNumber(baseIterations, 0) }} it noise floor ±{{
        floors.quick === null ? '—' : formatNumber(floors.quick, 1)
      }}</span
    >,
    <span class="num"
      >{{ rerunLabel }} noise floor ±{{ floors.final ? formatNumber(floors.final.noise, 1) : '—' }}</span
    >.
  </p>
  <div class="clip">
    <UiDataTable
      v-model:sort="sort"
      :columns="cols"
      :rows="rows"
      :row-key="(r) => r.key || 'equipped'"
      :row-state="(r) => (r.equipped ? 'reference' : undefined)"
      :caption="caption"
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
        <slot name="detail" :row="row" />
      </template>
      <template #cell-mean="{ row }">
        <span class="mean"
          ><span v-if="row.n !== baseIterations" class="it">{{ formatNumber(row.n / 1000, 0) }}k</span
          >{{ formatNumber(row.mean, 1) }}</span
        >
      </template>
      <template #cell-quick="{ row }">
        <span v-if="row.equipped" class="text-3">—</span>
        <span v-else class="num text-3">{{ formatSigned(row.quickDelta) }}</span>
      </template>
      <template #cell-delta="{ row }">
        <span v-if="row.equipped" class="text-3">—</span>
        <span v-else-if="rerunN !== null && !row.rerun" class="text-3 not-rerun">not re-run</span>
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
        <UiTooltip v-else :text="verdictTip(row)">
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
.rerun-note {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--line-seam);
  font-size: var(--text-xs);
  color: var(--text-2);
}
.rerun-note strong {
  font-weight: 500;
  color: var(--text-1);
}
.mean,
.not-rerun {
  white-space: nowrap;
}
.it {
  margin-right: 6px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
