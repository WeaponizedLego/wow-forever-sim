<script setup lang="ts">
// Each variant's DPS ± 95% CI on one forest axis, with Δ and a Welch verdict against the baseline (A).
import type { CompareRow } from '~/composables/compare';
import type { TableColumn } from '~/composables/ui-types';

const props = defineProps<{
  rows: CompareRow[];
  domain: [number, number];
  ticks: number[];
  /** Baseline identity color (the class color). */
  baseColor: string;
  opening: boolean;
}>();
const emit = defineEmits<{ open: [row: CompareRow] }>();

const cols: TableColumn<CompareRow>[] = [
  { key: 'letter', label: '', srLabel: 'Letter', width: '28px' },
  { key: 'name', label: 'Variant' },
  { key: 'mean', label: 'Mean DPS', numeric: true },
  { key: 'ci', label: '±', srLabel: '95% CI', numeric: true, tone: '3' },
  { key: 'delta', label: 'Δ vs A', srLabel: 'Change vs baseline', numeric: true },
  { key: 'forest', label: 'Mean and 95% CI', width: '30%' },
  { key: 'verdict', label: 'Verdict' },
  { key: 'open', label: '', srLabel: 'Open in workbench', width: '150px' },
];
const reference = computed(() => props.rows[0]?.result?.mean);
const pValue = (p: number) => (p < 0.001 ? '< 0.001' : `= ${p.toFixed(3)}`);
</script>

<template>
  <div class="clip">
    <UiDataTable
      :columns="cols"
      :rows="rows"
      :row-key="(r) => r.id"
      :row-state="(r) => (r.baseline ? 'reference' : undefined)"
      caption="DPS by variant"
      min-width="860px"
      density="lg"
    >
      <template #cell-letter="{ row }"
        ><span class="num letter">{{ row.letter }}</span></template
      >
      <template #cell-name="{ row }">
        <span class="name">{{ row.name }}</span>
      </template>
      <template #cell-mean="{ row }">
        <template v-if="row.result">{{ formatNumber(row.result.mean, 1) }}</template>
        <span v-else class="text-3">…</span>
      </template>
      <template #cell-ci="{ row }">
        <template v-if="row.result">±{{ formatNumber(row.result.ci95, 1) }}</template>
      </template>
      <template #cell-delta="{ row }">
        <span v-if="row.baseline" class="text-3">—</span>
        <UiDeltaValue
          v-else-if="row.delta !== undefined"
          :value="row.delta"
          :verdict="row.verdict"
          :glyph="false"
        />
      </template>
      <template #cell-forest="{ row }">
        <ChartsForestRow
          v-if="row.result"
          :mean="row.result.mean"
          :lo="row.result.mean - row.result.ci95"
          :hi="row.result.mean + row.result.ci95"
          :domain="domain"
          :reference="reference"
          :is-reference="row.baseline"
          :reference-color="baseColor"
          :label="`${row.letter} ${row.name}`"
        />
      </template>
      <template #head-forest>
        <span class="visually-hidden">Mean and 95% CI</span>
        <ChartsForestAxis :domain="domain" :ticks="ticks" />
      </template>
      <template #cell-verdict="{ row }">
        <span v-if="row.baseline" class="base"
          ><span class="base__dot" aria-hidden="true">●</span>Baseline</span
        >
        <UiTooltip
          v-else-if="row.delta !== undefined && row.verdict"
          :text="`|Δ| ${formatNumber(Math.abs(row.delta), 1)} vs noise floor ${formatNumber(row.noise ?? 0, 1)}${row.p == null ? '' : ` · Welch p ${pValue(row.p)}`}`"
        >
          <UiDeltaValue :value="row.delta" :verdict="row.verdict" show-verdict hide-value />
        </UiTooltip>
      </template>
      <template #cell-open="{ row }">
        <UiButton
          size="sm"
          variant="quiet"
          :disabled="opening"
          :aria-label="`Open ${row.letter} ${row.name} in workbench`"
          @click="emit('open', row)"
          >Open in workbench</UiButton
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
.letter {
  color: var(--text-1);
}
.name {
  color: var(--text-1);
}
.text-3 {
  color: var(--text-3);
}
.base {
  display: inline-flex;
  gap: 6px;
  color: var(--text-2);
}
.base__dot {
  color: v-bind(baseColor);
}
</style>
