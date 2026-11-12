<script setup lang="ts">
// Workbench (lane S2): edit the current character (the draft) and sim it against the last run.
// Sub-views are ?tab=… so each has its own URL; the right-hand column (pending changes, stats, caps)
// stays on every tab because every tab's edits show up there.
import { RACES, type ItemSlotId } from '@fsim/contracts';
import type { KeyValue, NavItem } from '~/composables/ui-types';
import { BUFF_PRESETS, specInfo, talentPoints } from '~/composables/workbench';

useHead({ title: 'Workbench · forever/sim' });

const route = useRoute();
const wb = useWorkbench();

const TABS = ['gear', 'talents', 'buffs', 'fight', 'rotation'] as const;
type Tab = (typeof TABS)[number];
const tab = computed<Tab>(() => {
  const t = String(route.query.tab ?? 'gear');
  return (TABS as readonly string[]).includes(t) ? (t as Tab) : 'gear';
});
const tabTo = (t: Tab) => (t === 'gear' ? '/workbench' : `/workbench?tab=${t}`);

const c = computed(() => wb.draft.value);

const subtitle = computed(() =>
  c.value ? `· ${RACES[c.value.race].name} ${specInfo(c.value.spec).name} · ${c.value.level}` : '',
);
const meta = computed(() => {
  const n = wb.changes.value.length;
  const from = wb.baseRunId.value
    ? `draft from run ${wb.baseRunId.value}`
    : 'draft from import · not simmed yet';
  return `${from} · ${n ? `${n} unsaved ${n === 1 ? 'change' : 'changes'}` : 'no unsaved changes'}`;
});

const tabs = computed<NavItem[]>(() => {
  const ch = c.value;
  const rot = ch?.rotation.kind === 'preset' ? ch.rotation.presetId : null;
  const rotName = wb.presets.value?.rotations.find((r) => r.id === rot)?.name;
  return [
    { label: 'Gear', to: tabTo('gear') },
    { label: 'Talents', to: tabTo('talents'), detail: ch ? talentPoints(ch.talents).join('/') : undefined },
    { label: 'Buffs', to: tabTo('buffs'), detail: BUFF_PRESETS.find((b) => b.id === ch?.buffs)?.short },
    { label: 'Fight', to: tabTo('fight'), detail: ch ? `${ch.encounter.durationSec}s` : undefined },
    {
      label: 'Rotation',
      to: tabTo('rotation'),
      detail: rotName && rotName.length <= 14 ? rotName : undefined,
    },
  ];
});

const kv = computed<KeyValue[]>(() => {
  const run = wb.lastRun.value;
  const est = wb.draftEstimate.value;
  const items: KeyValue[] = [
    { label: 'Avg ilvl', value: wb.avgIlvl.value === null ? '—' : formatNumber(wb.avgIlvl.value, 1) },
    { label: 'Last run', value: run ? formatNumber(run.summary.dpsMean, 1) : '—' },
  ];
  if (est && run && wb.changes.value.length) {
    items.push({
      label: 'Draft est.',
      value: formatNumber(est.value, 1),
      tone: est.value >= run.summary.dpsMean ? 'up' : 'down',
    });
  } else {
    items.push({ label: 'Draft est.', value: '—' });
  }
  return items;
});

// Item picker
const pickSlot = ref<ItemSlotId | null>(null);
let opener: HTMLElement | null = null;
function openPicker(slot: ItemSlotId) {
  opener = document.activeElement as HTMLElement | null;
  pickSlot.value = slot;
}
function closePicker() {
  pickSlot.value = null;
  nextTick(() => opener?.focus());
}
</script>

<template>
  <main class="page">
    <template v-if="!c">
      <h1 class="visually-hidden">Workbench</h1>
      <UiEmptyState
        title="No character to edit"
        body="Paste a SimC, WoWSims or Wowhead export on New run, or start from a spec preset, then open it here."
      >
        <UiButton variant="primary" to="/">New run</UiButton>
      </UiEmptyState>
    </template>

    <template v-else>
      <UiPageHeader
        :title="c.name || specInfo(c.spec).name"
        :subtitle="subtitle"
        :meta="meta"
        :marker="c.class"
        :items="kv"
      >
        <UiTabNav label="Workbench" :items="tabs" :current="tabTo(tab)" class="tabs" />
      </UiPageHeader>

      <WorkbenchDiagnostics />

      <UiPanelGrid>
        <WorkbenchGearTable v-if="tab === 'gear'" @pick="openPicker" />
        <WorkbenchTalentsTab v-else-if="tab === 'talents'" />
        <WorkbenchBuffsTab v-else-if="tab === 'buffs'" />
        <WorkbenchFightTab v-else-if="tab === 'fight'" />
        <WorkbenchRotationTab v-else />
        <WorkbenchPendingChanges />
        <WorkbenchStatsPanel />
        <WorkbenchCapsPanel />
      </UiPanelGrid>
    </template>
  </main>
  <WorkbenchSimBar v-if="c" />
  <WorkbenchItemPicker v-if="pickSlot" :key="pickSlot" :slot-id="pickSlot" @close="closePicker" />
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) 0;
}
@media (max-width: 640px) {
  .page {
    padding: var(--space-3) var(--space-5) 0;
  }
  /* UiTabNav centers its tabs; centered overflow cannot scroll to the first tab. */
  .page .tabs {
    justify-content: flex-start;
    width: 100%;
  }
}
</style>
