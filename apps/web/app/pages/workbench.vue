<script setup lang="ts">
// Workbench (lane S2): edit the current character (the draft) and sim it against the last run.
// Sub-views are ?tab=… so each has its own URL; the right-hand column (pending changes, stats, caps)
// stays on every tab because every tab's edits show up there.
import { ITEM_SLOTS, RACES, fightStyle, type ItemSlotId } from '@fsim/contracts';
import { changedSettings, specOptionFields, specOptionRows } from '@fsim/gamedata';
import type { KeyValue, NavItem } from '~/composables/ui-types';
import { BUFF_PRESETS, specInfo, talentPoints } from '~/composables/workbench';

useHead({ title: 'Workbench · forever/sim' });

const route = useRoute();
const wb = useWorkbench();
const session = useSession();

// No draft (first visit, or storage was cleared) but runs in history: offer the latest run's character.
const latest = computed(() => session.latest.value?.record ?? null);
function openLatest() {
  if (latest.value) session.openRun(latest.value.id);
}

const TABS = ['gear', 'talents', 'options', 'buffs', 'fight', 'rotation'] as const;
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
  const rot = ch?.rotation.kind === 'preset' ? ch.rotation : null;
  const preset = wb.presets.value?.rotations.find((r) => r.id === rot?.presetId);
  const rotName = preset?.name;
  const edited = !!preset && !!rot && changedSettings(preset, rot).length > 0;
  // Options: only for a spec that has any (a Rogue has none), with how many are not at the preset's value.
  const p = wb.presets.value;
  const offPreset =
    ch && p?.specId === ch.spec ? specOptionRows(ch, p).rows.filter((r) => r.value !== r.preset).length : 0;
  return [
    { label: 'Gear', to: tabTo('gear') },
    { label: 'Talents', to: tabTo('talents'), detail: ch ? talentPoints(ch.talents).join('/') : undefined },
    ...(ch && specOptionFields(ch.spec).length
      ? [{ label: 'Options', to: tabTo('options'), detail: offPreset ? `${offPreset} changed` : undefined }]
      : []),
    { label: 'Buffs', to: tabTo('buffs'), detail: BUFF_PRESETS.find((b) => b.id === ch?.buffs)?.short },
    {
      label: 'Fight',
      to: tabTo('fight'),
      detail: !ch
        ? undefined
        : ch.encounter.style === 'custom'
          ? `${ch.encounter.durationSec}s`
          : fightStyle(ch.encounter.style).short,
    },
    {
      label: 'Rotation',
      to: tabTo('rotation'),
      // Always shown: which rotation runs decides what gets cast. The longest upstream name is 20 characters.
      // "edited": its settings were changed on the tab.
      detail:
        rotName && (rotName.length > 20 ? `${rotName.slice(0, 19)}…` : rotName) + (edited ? ' · edited' : ''),
    },
  ];
});

const kv = computed<KeyValue[]>(() => {
  const run = wb.lastRun.value;
  const est = wb.draftEstimate.value;
  const items: KeyValue[] = [
    { label: 'Avg ilvl', value: wb.avgIlvl.value === null ? '—' : formatNumber(wb.avgIlvl.value, 1) },
    { label: 'Last run', value: run ? `${formatNumber(run.summary.dpsMean, 1)} DPS` : '—' },
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
const pickItem = ref<number | undefined>();
let opener: HTMLElement | null = null;
function openPicker(slot: ItemSlotId, itemId?: number) {
  opener = document.activeElement as HTMLElement | null;
  pickItem.value = itemId;
  pickSlot.value = slot;
}
function closePicker() {
  pickSlot.value = null;
  pickItem.value = undefined;
  nextTick(() => opener?.focus());
}
// ?pick=<slot>&item=<id> (from the command palette) opens the picker on that item; the query is then dropped.
watch(
  [() => route.query.pick, c],
  ([pick]) => {
    if (!c.value || typeof pick !== 'string' || !(ITEM_SLOTS as readonly string[]).includes(pick)) return;
    openPicker(pick as ItemSlotId, Number(route.query.item) || undefined);
    const { pick: _pick, item: _item, ...rest } = route.query;
    void navigateTo({ query: rest }, { replace: true });
  },
  { immediate: true },
);
</script>

<template>
  <main class="page">
    <template v-if="!c">
      <h1 class="visually-hidden">Workbench</h1>
      <UiEmptyState
        v-if="latest"
        title="No character to edit"
        :body="`Pick up where you left off with the character from run ${latest.id}, or paste a SimC, WoWSims or Wowhead export on New run.`"
      >
        <UiButton variant="primary" @click="openLatest">Open run {{ latest.id }}</UiButton>
        <UiButton to="/">New run</UiButton>
      </UiEmptyState>
      <UiEmptyState
        v-else
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
        <WorkbenchOptionsTab v-else-if="tab === 'options'" />
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
  <WorkbenchItemPicker
    v-if="pickSlot"
    :key="`${pickSlot}:${pickItem ?? ''}`"
    :slot-id="pickSlot"
    :item-id="pickItem"
    @close="closePicker"
  />
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
