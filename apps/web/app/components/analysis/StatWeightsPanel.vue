<script setup lang="ts">
// Stat weights of the run, or a button to compute them.
import type { StatWeightRow } from '@fsim/analysis';
import type { TableColumn } from '~/composables/ui-types';
import { Stat } from '@fsim/proto/common';

type Row = StatWeightRow & { label: string; isReference: boolean };
const props = defineProps<{
  rows: Row[] | null;
  running: boolean;
  progress: number | null;
  error: string | null;
  statsText: string;
  iterations: number;
}>();
const emit = defineEmits<{ compute: []; cancel: [] }>();

const cols: TableColumn<Row>[] = [
  { key: 'stat', label: 'Stat' },
  { key: 'value', label: 'Weight', numeric: true },
  { key: 'ci', label: '±', srLabel: '95% CI (±)', numeric: true, tone: '3' },
  { key: 'whisker', label: 'CI as % of weight', width: '34%' },
];
const fmt = (v: number) => formatNumber(v, 2);
const rel = (r: Row) => (r.relError === null ? 0 : (r.ci95 / Math.abs(r.weight)) * 100);
const copied = ref(false);

/** Pawn import string from the EP values (reference stat = 1). */
async function copyPawn() {
  if (!props.rows) return;
  const parts = props.rows.map((r) => `${Stat[r.ref.stat as Stat].replace(/^Stat/, '')}=${r.ep.toFixed(2)}`);
  await navigator.clipboard.writeText(`( Pawn: v1: "forever/sim": ${parts.join(', ')} )`);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <UiPanel title="Stat weights" :meta="rows ? 'DPS per point · 95% CI' : undefined">
    <template v-if="rows">
      <UiDataTable
        :columns="cols"
        :rows="rows"
        :row-key="(r) => r.label"
        hide-header
        density="sm"
        caption="Stat weights"
      >
        <template #cell-stat="{ row }"
          ><span class="stat">{{ row.label }}</span></template
        >
        <template #cell-value="{ row }">{{ fmt(row.weight) }}</template>
        <template #cell-ci="{ row }">±{{ fmt(row.ci95) }}</template>
        <template #cell-whisker="{ row }">
          <ChartsWhiskerDot
            :rel="rel(row)"
            :max="25"
            :label="row.label"
            :value-text="fmt(row.weight)"
            :ci-text="`±${fmt(row.ci95)}`"
          />
        </template>
      </UiDataTable>
      <div class="foot">
        <span class="note">Whisker: CI as % of the weight</span>
        <UiButton size="sm" @click="copyPawn">{{ copied ? 'Copied' : 'Copy Pawn' }}</UiButton>
      </div>
    </template>
    <div v-else class="empty">
      <p class="note">
        Not computed for this run. Weighs {{ statsText }} with the run's seed,
        {{ formatNumber(iterations, 0) }}
        iterations per stat.
      </p>
      <UiProgressBar v-if="running" label="Stat weights" :value="progress ?? undefined" detail="one worker" />
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <UiButton v-if="running" variant="quiet" size="sm" @click="emit('cancel')">Cancel</UiButton>
        <UiButton v-else size="sm" @click="emit('compute')">Compute stat weights</UiButton>
      </div>
    </div>
  </UiPanel>
</template>

<style scoped>
.stat {
  font-family: var(--font-sans);
  font-size: var(--text-md);
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px var(--space-4);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-4);
}
.actions {
  display: flex;
  gap: 6px;
}
.error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--status-warning);
}
</style>
