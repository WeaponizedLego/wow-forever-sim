<script setup lang="ts">
import type { ClassId } from '@fsim/contracts';
import type { TableColumn } from '~/composables/ui-types';

// Runs from this page load, newest first. Runs made on another engine than the staged one are marked.
defineProps<{ span: number }>();
const session = useSession();
const engine = useEngine();

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => (tick = setInterval(() => (now.value = Date.now()), 30_000)));
onBeforeUnmount(() => clearInterval(tick));

interface Row {
  id: string;
  to: string;
  cls: ClassId;
  who: string;
  spec: string;
  dps: number;
  ci: number;
  engineId: string;
  old: boolean;
  createdAt: string;
}

const rows = computed<Row[]>(() =>
  session.runs.value.map(({ record: r }) => ({
    id: r.id,
    to: `/runs/${r.id.replace(/^#/, '')}`,
    cls: r.character.class,
    who: (r.character.name || startSpecName(r.character.spec)) + (r.kind === 'top-gear' ? ' · top gear' : ''),
    spec: startSpecName(r.character.spec),
    dps: r.summary.dpsMean,
    ci: r.summary.dpsCi95,
    engineId: r.engine.engineId,
    old: !!engine.version.value && r.engine.engineId !== engine.version.value.engineId,
    createdAt: r.createdAt,
  })),
);

const columns: TableColumn<Row>[] = [
  { key: 'id', label: 'Run', numeric: true, align: 'left', tone: '3', width: '64px' },
  { key: 'who', label: 'Character' },
  { key: 'dps', label: 'DPS', numeric: true },
  { key: 'engineId', label: 'Engine', numeric: true },
  { key: 'createdAt', label: 'When', align: 'right', tone: '3' },
];
</script>

<template>
  <UiPanel title="Recent runs" :span="span">
    <template #meta><span>this tab</span></template>
    <UiEmptyState
      v-if="!rows.length"
      title="No runs yet"
      body="Sim a pasted export or a spec preset and the run shows up here."
    />
    <template v-else>
      <UiDataTable
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.id"
        caption="Recent runs"
        hide-header
        min-width="420px"
        max-height="320px"
      >
        <template #cell-id="{ row }">
          <NuxtLink :to="row.to" class="run-link">{{ row.id }}</NuxtLink>
        </template>
        <template #cell-who="{ row }">
          <span class="who">
            <UiClassMarker :cls="row.cls" />
            <span class="who__name">{{ row.who }}</span>
            <span v-if="row.who !== row.spec" class="who__spec">{{ row.spec }}</span>
          </span>
        </template>
        <template #cell-dps="{ row }">
          {{ formatNumber(row.dps, 1) }}<span class="ci"> ±{{ formatNumber(row.ci, 1) }}</span>
        </template>
        <template #cell-engineId="{ row }">
          <span class="eng">
            <UiStatusGlyph v-if="row.old" status="warning" hide-label label="Older engine" />
            {{ row.engineId }}{{ row.old ? ' · old' : '' }}
          </span>
        </template>
        <template #cell-createdAt="{ row }">{{ startAgo(row.createdAt, now) }}</template>
      </UiDataTable>
    </template>
    <template #footer>
      <p class="note">
        Kept in memory for this tab only; reloading clears them. Runs on an older engine are marked.
      </p>
    </template>
  </UiPanel>
</template>

<style scoped>
.run-link {
  color: var(--text-2);
}
.who {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.who__spec {
  color: var(--text-3);
}
.ci {
  color: var(--text-3);
  font-size: var(--text-xs);
}
.eng {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.note {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
