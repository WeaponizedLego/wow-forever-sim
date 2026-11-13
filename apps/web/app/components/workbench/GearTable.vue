<script setup lang="ts">
import { ITEM_SLOTS, type GearItem, type ItemSlotId } from '@fsim/contracts';
import { itemLevel, primarySourceLabel } from '@fsim/gamedata';
import type { RowState, TableColumn } from '~/composables/ui-types';
import { SLOT_LABELS, enchantName, itemName, qualityOf, weightPlan } from '~/composables/workbench';

// The equipped gear: one row per slot (empty ones included, so an off hand can be added). Clicking an item
// opens the item picker for its slot.
const emit = defineEmits<{ pick: [slot: ItemSlotId] }>();
const wb = useWorkbench();
const session = useSession();

interface Row {
  slot: ItemSlotId;
  label: string;
  gear?: GearItem;
  name: string;
  quality: ReturnType<typeof qualityOf>;
  missing: boolean;
  ilvl: number | null;
  source: string;
  enchant: string | null;
  enchantChanged: boolean;
  was: string | null;
  changed: boolean;
  value: number | null;
  gain: number;
}

const dataIssues = computed(
  () =>
    new Set(
      session.importDiagnostics.value.filter((d) => d.code === 'DATA-03' && d.field).map((d) => d.field!),
    ),
);

const rows = computed<Row[]>(() => {
  const c = wb.draft.value;
  const base = wb.baseline.value;
  const db = wb.db.value;
  if (!c) return [];
  return ITEM_SLOTS.map((slot) => {
    const g = c.gear[slot];
    const b = base?.gear[slot];
    const item = g && db?.item(g.itemId);
    const itemChanged =
      (g?.itemId ?? 0) !== (b?.itemId ?? 0) || (g?.randomSuffix ?? 0) !== (b?.randomSuffix ?? 0);
    const enchantChanged = (g?.enchantId ?? 0) !== (b?.enchantId ?? 0);
    const est = wb.slotValues.value[slot];
    const change = wb.changeEstimates.value[`gear:${slot}`];
    return {
      slot,
      label: SLOT_LABELS[slot],
      gear: g,
      name: g ? (item || !db ? itemName(db, g) : `Item ${g.itemId} — not in data`) : 'Empty',
      quality: qualityOf(item || undefined),
      missing: !!g && !!db && (!item || dataIssues.value.has(slot)),
      ilvl: item ? itemLevel(item) : null,
      source: item && db ? primarySourceLabel(db, item.sources) : '—',
      enchant: enchantName(db, g),
      enchantChanged: enchantChanged && !itemChanged,
      was: itemChanged && b ? itemName(db, b) : null,
      changed: itemChanged || enchantChanged,
      value: est ? est.delta : null,
      gain: change && change.delta > 0 ? change.delta : 0,
    };
  });
});

const maxValue = computed(() => Math.max(1, ...rows.value.map((r) => r.value ?? 0)));
const metric = computed(() =>
  wb.draft.value ? weightPlan(wb.draft.value.spec).metric.toUpperCase() : 'DPS',
);

const columns: TableColumn<Row>[] = [
  { key: 'label', label: 'Slot', tone: '3', width: '84px' },
  { key: 'name', label: 'Item' },
  { key: 'ilvl', label: 'ilvl', numeric: true, tone: '2', width: '52px' },
  { key: 'source', label: 'Source', tone: '2' },
  { key: 'enchant', label: 'Enchant' },
  { key: 'value', label: 'Value', width: '20%' },
];
const rowState = (r: Row): RowState | undefined =>
  r.missing ? 'warning' : r.changed ? 'changed' : undefined;
</script>

<template>
  <UiPanel title="Equipped" :span="8" :row-span="3">
    <template #meta>
      <span v-if="wb.weights.value" class="meta"
        >Value = estimated {{ metric }} from this item's stats, using run
        {{ wb.weights.value.runId }} weights</span
      >
      <span v-else class="meta">Run stat weights to see each item's estimated value</span>
    </template>
    <UiDataTable
      :columns="columns"
      :rows="rows"
      :row-key="(r) => r.slot"
      :row-state="rowState"
      caption="Equipped gear"
      min-width="780px"
    >
      <template #cell-name="{ row }">
        <div v-if="row.was" class="was"><span class="visually-hidden">Replaces </span>{{ row.was }}</div>
        <button
          type="button"
          class="pick"
          :aria-label="`${row.label}: ${row.name}. Change item`"
          @click="emit('pick', row.slot)"
        >
          <span v-if="!row.gear" class="empty">Empty</span>
          <UiQualityName v-else :quality="row.quality" :missing="row.missing">{{ row.name }}</UiQualityName>
        </button>
      </template>
      <template #cell-ilvl="{ row }">{{ row.ilvl ?? '—' }}</template>
      <template #cell-source="{ row }">
        <span v-if="row.missing" class="warn">Unknown</span>
        <template v-else>{{ row.gear ? row.source : '' }}</template>
      </template>
      <template #cell-enchant="{ row }">
        <span v-if="!row.enchant" class="none">—</span>
        <span v-else :class="row.enchantChanged ? 'new' : 'text-2'">{{ row.enchant }}</span>
      </template>
      <template #cell-value="{ row }">
        <ChartsInlineBar
          v-if="row.value !== null"
          :value="Math.max(0, row.value)"
          :max="maxValue"
          :gain="row.gain"
          :text="formatNumber(row.value, 1)"
        />
        <span v-else class="none num">—</span>
      </template>
    </UiDataTable>
    <p class="foot">
      <template v-if="wb.weights.value">
        Linear in the item's stats. Weapon damage, procs and set bonuses carry no weight here, so weapons and
        proc trinkets read low; only a sim prices them.
      </template>
      <template v-else>
        Tick <strong>Stat weights</strong> in the sim bar and run once: values and estimated gains then fill
        in from that run's weights.
      </template>
    </p>
  </UiPanel>
</template>

<style scoped>
.meta {
  font-family: var(--font-sans);
}
.was {
  color: var(--text-3);
  text-decoration: line-through;
  font-size: var(--text-sm);
}
.pick {
  padding: 0;
  border: 0;
  background: none;
  font-size: var(--text-md);
  text-align: left;
  cursor: pointer;
}
.pick:hover :deep(.qname),
.pick:hover .empty {
  text-decoration: underline;
  text-decoration-color: currentColor;
  text-underline-offset: 3px;
}
.empty,
.none {
  color: var(--text-disabled);
}
.warn {
  color: var(--status-warning);
}
.new {
  color: var(--delta-up);
}
.text-2 {
  color: var(--text-2);
}
.foot {
  margin: 0;
  padding: 10px var(--space-4) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
  border-top: 1px solid var(--line-row);
}
.foot strong {
  font-weight: 500;
  color: var(--text-2);
}
</style>
