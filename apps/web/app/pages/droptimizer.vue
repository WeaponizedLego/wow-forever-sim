<script setup lang="ts">
// Droptimizer (docs/features.md §3): pick a dungeon or raid and its bosses, sim every drop the character
// could wear as a one-item swap, and rank them by DPS gain over the equipped item.
import { ITEM_SLOTS, type ItemSlotId } from '@fsim/contracts';
import { classColorVar } from '@fsim/gamedata';
import type { RankedRow } from '~/composables/topGear';

useHead({ title: 'Droptimizer · forever/sim' });

const session = useSession();
const dt = useDroptimizer();
const char = computed(() => session.character.value);

const ITERATION_OPTIONS = [
  { value: '250', label: '250', mono: true },
  { value: '500', label: '500', mono: true },
  { value: '1000', label: '1k', mono: true },
  { value: '2000', label: '2k', mono: true },
];
const iterations = ref('500');
const refine = ref(true);
const editing = ref(dt.batch.value?.status !== 'done');
const runError = ref<string | null>(null);
const equipping = ref(false);

const batch = computed(() => dt.batch.value);
const running = computed(() => batch.value?.status === 'running');
watch(
  () => batch.value?.status,
  (s) => {
    if (s === 'done') editing.value = false;
  },
);

// ---- picking
const raids = computed(() => dt.instances.value.filter((i) => i.kind === 'raid'));
const dungeons = computed(() => dt.instances.value.filter((i) => i.kind === 'dungeon'));
function onZone(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  dt.setZone(v ? Number(v) : null);
}
const sources = computed(() => dt.instance.value?.sources ?? []);
const allSources = computed(() => dt.selectedKeys.value.length === sources.value.length);
const sourceOn = (key: string) => dt.selectedKeys.value.includes(key);
function toggleSource(key: string, on: boolean) {
  const next = new Set(dt.selectedKeys.value);
  if (on) next.add(key);
  else next.delete(key);
  dt.setSources(next.size === sources.value.length ? null : [...next]);
}

/** Slot groups: rings and trinkets as one chip. */
const SLOT_GROUPS: { label: string; slots: ItemSlotId[] }[] = ITEM_SLOTS.filter(
  (s) => s !== 'finger2' && s !== 'trinket2',
).map((s) =>
  s === 'finger1'
    ? { label: 'Rings', slots: ['finger1', 'finger2'] }
    : s === 'trinket1'
      ? { label: 'Trinkets', slots: ['trinket1', 'trinket2'] }
      : { label: TOP_GEAR_SLOT_LABELS[s], slots: [s] },
);
const planSlots = computed(() => {
  const cands = dt.fullPlan.value?.candidates ?? [];
  return SLOT_GROUPS.map((g) => ({
    ...g,
    count: new Set(cands.filter((c) => g.slots.includes(c.slot)).map((c) => c.itemId)).size,
  })).filter((g) => g.count > 0);
});
const groupOn = (g: { slots: ItemSlotId[] }) => g.slots.every((s) => !dt.slotsOff.value[s]);
function toggleGroup(g: { slots: ItemSlotId[] }, on: boolean) {
  const next = { ...dt.slotsOff.value };
  for (const s of g.slots) next[s] = !on;
  dt.slotsOff.value = next;
}

const sims = computed(() => dt.plan.value?.candidates.length ?? 0);
const items = computed(() => dt.plan.value?.items ?? 0);
const tooMany = computed(() => sims.value > DROP_MAX_CANDIDATES);
const many = computed(() => sims.value > DROP_WARN_CANDIDATES);
const fights = computed(() => {
  const fast = (sims.value + 1) * Number(iterations.value);
  const slow = refine.value ? (Math.min(DROP_REFINE_TOP, sims.value) + 1) * DROP_REFINE_ITERATIONS : 0;
  return fast + slow;
});

async function start() {
  runError.value = null;
  try {
    await dt.run(Number(iterations.value), refine.value);
  } catch (e) {
    runError.value = e instanceof Error ? e.message : String(e);
  }
}

// ---- ranking view
const resultSlotGroups = computed(() => {
  const cands = [...dt.batchCandidates.value.values()];
  return SLOT_GROUPS.map((g) => ({
    ...g,
    count: new Set(cands.filter((c) => g.slots.includes(c.slot)).map((c) => c.itemId)).size,
  })).filter((g) => g.count > 0);
});
const viewOff = ref<Record<string, boolean>>({});
const hideNoise = ref(false);
const visible = computed(() =>
  dt.ranking.value.filter((r) => {
    if (r.equipped) return true;
    if (hideNoise.value && r.verdict === 'noise') return false;
    const slot = dt.batchCandidates.value.get(r.key)?.slot;
    const group = SLOT_GROUPS.find((g) => slot && g.slots.includes(slot));
    return !group || !viewOff.value[group.label];
  }),
);
const forest = computed(() => {
  const rows = visible.value;
  if (!rows.length) return { domain: [0, 1] as [number, number], ticks: [] };
  const lo = Math.min(...rows.map((r) => r.mean - r.ci95));
  const hi = Math.max(...rows.map((r) => r.mean + r.ci95));
  const pad = (hi - lo) * 0.06 || 1;
  const domain: [number, number] = [lo - pad, hi + pad];
  return {
    domain,
    ticks: niceTicks(domain[0], domain[1], 5).filter((t) => t >= domain[0] && t <= domain[1]),
  };
});
const ref0 = computed(() => dt.reference.value);
const typicalNoise = computed(() => {
  const rows = dt.ranking.value.filter((r) => !r.equipped);
  if (!rows.length) return null;
  const sorted = rows.map((r) => r.noise).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
});
const upgrades = computed(() => dt.ranking.value.filter((r) => r.verdict === 'up').length);

const headerItems = computed(() => {
  const b = batch.value;
  if (!b || !ref0.value) return [];
  const rows = dt.ranking.value;
  const atBase = rows.find((r) => r.n === b.iterations);
  const rerun = rows.filter((r) => !r.equipped && r.n !== b.iterations);
  const perDrop = [
    `${formatNumber(b.iterations, 0)} it`,
    ...(atBase ? [`CI ±${formatNumber(atBase.ci95, 1)}`] : []),
    ...(rerun.length ? [`top ${rerun.length} at ${formatNumber(rerun[0]!.n / 1000, 0)}k`] : []),
  ];
  return [
    { label: 'Upgrades', value: `${upgrades.value} of ${rows.length - 1}` },
    { label: 'Fights simmed', value: formatNumber(b.fights, 0) },
    { label: 'Per drop', value: perDrop.join(' · ') },
    ...(typicalNoise.value === null
      ? []
      : [{ label: 'Noise floor', value: `|Δ| < ${formatNumber(typicalNoise.value, 1)}` }]),
    { label: 'Seed', value: String(b.seed) },
    { label: 'Wall', value: formatDuration(b.wallMs) },
  ];
});
const meta = computed(() => {
  if (!editing.value && dt.batchZone.value) {
    const z = dt.batchZone.value;
    const n = dt.batchCandidates.value.size;
    return `${z.name} · ${sourceText(z.sources)} → ${n} drop sim${n === 1 ? '' : 's'}`;
  }
  const inst = dt.instance.value;
  const p = dt.plan.value;
  if (!inst || !p) return 'Pick a dungeon or raid';
  const picked = sources.value.filter((s) => sourceOn(s.key)).map((s) => s.name);
  return `${inst.name} · ${sourceText(picked)} → ${p.items} item${p.items === 1 ? '' : 's'}, ${sims.value} sim${sims.value === 1 ? '' : 's'}`;
});
function sourceText(names: string[]) {
  if (names.length === sources.value.length && names.length > 1) return 'all bosses';
  if (names.length <= 2) return names.join(', ') || 'no bosses';
  return `${names.length} bosses`;
}

const progressLabel = computed(() => {
  const b = batch.value;
  if (!b) return '';
  const n = `${Math.min(b.done + 1, b.total)} of ${b.total}`;
  return dt.pass.value?.kind === 'refine' ? `Re-run at 10k · ${n}` : `Fast pass · sim ${n}`;
});
const progressDetail = computed(() => {
  const b = batch.value;
  if (!b) return '';
  const eta = dt.etaMs.value;
  return eta === null
    ? formatDuration(b.wallMs)
    : `${formatDuration(b.wallMs)} · ~${formatDuration(eta)} left`;
});

function formatDuration(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${formatNumber(s, 1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const slotTag = (s: ItemSlotId) => TOP_GEAR_SLOT_LABELS[s].toUpperCase();
const bestSlotLabel = (s: ItemSlotId) =>
  s === 'finger1' ? 'Ring' : s === 'trinket1' ? 'Trinket' : TOP_GEAR_SLOT_LABELS[s];

async function equip(row: RankedRow) {
  equipping.value = true;
  try {
    await dt.equip(row.key);
    await navigateTo('/workbench');
  } finally {
    equipping.value = false;
  }
}
</script>

<template>
  <main class="page">
    <UiEmptyState
      v-if="!char"
      title="No character yet"
      body="The droptimizer sims drops on the character you are working on. Import one or start from a spec first."
    >
      <UiButton variant="primary" to="/">New run</UiButton>
    </UiEmptyState>

    <template v-else>
      <UiPageHeader
        title="Droptimizer"
        :subtitle="`· ${char.name || 'Character'}`"
        :meta="meta"
        :marker="char.class"
        :items="editing ? [] : headerItems"
      >
        <template #actions>
          <UiButton v-if="batch && !editing" :disabled="running" @click="editing = true"
            >Change bosses</UiButton
          >
          <UiButton
            v-if="batch && !editing"
            variant="primary"
            :disabled="running || !ref0"
            @click="dt.rerunTop()"
            >Re-run top {{ DROP_REFINE_TOP }} at 10k</UiButton
          >
        </template>
      </UiPageHeader>

      <template v-if="editing">
        <UiPanelGrid>
          <UiPanel title="Instance" :span="12" padded>
            <div class="pick">
              <label class="sel">
                <span class="label">Dungeon or raid</span>
                <select :value="dt.zoneId.value ?? ''" :disabled="running" @change="onZone">
                  <option value="">Pick one…</option>
                  <optgroup label="Raids">
                    <option v-for="i in raids" :key="i.zoneId" :value="i.zoneId">{{ i.name }}</option>
                  </optgroup>
                  <optgroup label="Dungeons">
                    <option v-for="i in dungeons" :key="i.zoneId" :value="i.zoneId">{{ i.name }}</option>
                  </optgroup>
                </select>
              </label>
              <div v-if="sources.length" class="chips" role="group" aria-label="Bosses">
                <span class="label">Bosses</span>
                <UiFilterChip
                  :model-value="allSources"
                  @update:model-value="(v: boolean) => dt.setSources(v ? null : [])"
                  >All</UiFilterChip
                >
                <UiFilterChip
                  v-for="s in sources"
                  :key="s.key"
                  :model-value="sourceOn(s.key)"
                  :count="dt.usablePerSource.value.get(s.key) ?? 0"
                  @update:model-value="(v: boolean) => toggleSource(s.key, v)"
                  >{{ s.name }}</UiFilterChip
                >
              </div>
              <div v-if="planSlots.length" class="chips" role="group" aria-label="Slots">
                <span class="label">Slots</span>
                <UiFilterChip
                  v-for="g in planSlots"
                  :key="g.label"
                  :model-value="groupOn(g)"
                  :count="g.count"
                  @update:model-value="(v: boolean) => toggleGroup(g, v)"
                  >{{ g.label }}</UiFilterChip
                >
              </div>
              <p v-if="dt.instance.value" class="note">
                Counts are the drops {{ char.name || 'this character' }} could wear and whose stats the spec
                weighs, up to level {{ char.level }}. Rings and trinkets are simmed in both slots and
                dual-wield weapons in both hands; the better slot is kept.
              </p>
            </div>
          </UiPanel>

          <template v-if="dt.plan.value">
            <UiPanel title="Drops to sim" :span="8" :meta="`${dt.plan.value.items} items`">
              <DroptimizerCandidateList
                v-if="dt.plan.value.candidates.length"
                :candidates="dt.plan.value.candidates"
              />
              <p v-else class="note pad">
                Nothing from these bosses fits this character. Pick other bosses or another instance.
              </p>
            </UiPanel>
            <UiPanelStack :span="4">
              <DroptimizerSkippedPanel :skipped="dt.plan.value.skipped" />
            </UiPanelStack>
          </template>
        </UiPanelGrid>

        <div class="runbar">
          <UiSegmentedControl v-model="iterations" label="Fast pass" :options="ITERATION_OPTIONS" />
          <UiCheckbox v-model="refine">Then re-run the top {{ DROP_REFINE_TOP }} at 10k</UiCheckbox>
          <span class="num note">
            {{ formatNumber(sims, 0) }} sims + equipped · {{ formatNumber(fights, 0) }} fights
          </span>
          <span class="note grow">
            Every drop runs with the same seed as the equipped set, so differences come from the item, not
            from luck. Enchants carry over where they fit.
          </span>
          <UiButton v-if="batch && !running" variant="quiet" @click="editing = false"
            >Back to results</UiButton
          >
          <UiButton variant="primary" size="lg" :disabled="running || sims < 1 || tooMany" @click="start">{{
            sims < 1
              ? 'Pick bosses with drops'
              : `Sim ${formatNumber(items, 0)} drop${items === 1 ? '' : 's'}`
          }}</UiButton>
        </div>
        <p v-if="tooMany" class="warn">
          {{ formatNumber(sims, 0) }} sims is more than the {{ DROP_MAX_CANDIDATES }} a batch runs. Pick fewer
          bosses or switch off some slots.
        </p>
        <p v-else-if="many" class="warn">
          {{ formatNumber(sims, 0) }} sims will take a while. Lower the fast pass or narrow the bosses or
          slots to speed it up; you can cancel at any point and keep what has finished.
        </p>
      </template>

      <p v-if="runError || batch?.error" class="warn">{{ runError ?? batch?.error }}</p>

      <div v-if="running && batch" class="progress">
        <UiProgressBar :label="progressLabel" :value="batch.progress" :detail="progressDetail" />
        <UiButton variant="quiet" size="sm" @click="dt.cancel()">Cancel</UiButton>
      </div>
      <p v-if="batch?.status === 'cancelled'" class="note">
        Cancelled: {{ batch.done }} of {{ batch.total }} sims in that pass finished. The ranking shows what
        finished.
      </p>

      <template v-if="!editing && dt.ranking.value.length && ref0">
        <div class="filters">
          <span class="label">Slots</span>
          <UiFilterChip
            v-for="g in resultSlotGroups"
            :key="g.label"
            :model-value="!viewOff[g.label]"
            :count="g.count"
            @update:model-value="(v: boolean) => (viewOff = { ...viewOff, [g.label]: !v })"
            >{{ g.label }}</UiFilterChip
          >
          <span class="vsep" aria-hidden="true" />
          <UiCheckbox v-model="hideNoise">Hide results within noise</UiCheckbox>
          <span class="grow" />
          <span class="num note"
            >showing {{ visible.length }} of {{ dt.ranking.value.length }} · sorted by mean</span
          >
        </div>

        <UiPanelGrid>
          <UiPanel title="Ranking" :span="9">
            <template #meta>
              <ChartsLegend
                :items="[
                  { label: 'Mean', mark: 'dot', color: 'var(--text-1)' },
                  { label: '95% CI', mark: 'whisker', color: 'var(--series-baseline)' },
                  { label: 'Equipped', mark: 'vline', color: classColorVar(char.class) },
                ]"
              />
            </template>
            <TopGearRanking
              :rows="visible"
              :reference="ref0.mean"
              :domain="forest.domain"
              :ticks="forest.ticks"
              :slot-tag="slotTag"
              :base-iterations="batch!.iterations"
              :equipping="equipping"
              :class-color="classColorVar(char.class)"
              caption="Droptimizer ranking"
              @equip="equip"
            >
              <template #detail="{ row }">
                <span v-if="!row.equipped" class="detail">
                  {{ dt.batchCandidates.value.get(row.key)?.sources.join(', ') }}
                  <template v-for="f in dt.batchCandidates.value.get(row.key)?.flags ?? []" :key="f">
                    · <span class="flag">{{ DROP_FLAG_LABELS[f] }}</span>
                  </template>
                  <template v-for="a in dt.alternatives(row)" :key="a.slot">
                    · as {{ TOP_GEAR_SLOT_LABELS[a.slot] }}
                    <UiDeltaValue :value="a.delta" :verdict="a.verdict" :glyph="false" />
                  </template>
                </span>
              </template>
            </TopGearRanking>
            <p class="note pad">
              Each row swaps one drop into the draft; rings, trinkets and dual-wield weapons show their better
              slot. Verdict: Welch's t-test against the equipped set, counted only when |Δ| also clears the
              noise floor (1.96 × the combined standard error). With a shared seed the runs are not
              independent, so the test errs on the side of "within noise".
            </p>
          </UiPanel>

          <UiPanelStack :span="3">
            <DroptimizerSourceSummary :rows="dt.bySource.value" />
            <TopGearBestPerSlot :rows="dt.bestPerSlot.value" :slot-label="bestSlotLabel" />
          </UiPanelStack>
        </UiPanelGrid>
      </template>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) 40px;
}
.pick {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.sel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 360px;
}
.sel select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  color: var(--text-1);
  font-size: var(--text-sm);
}
.chips {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}
.chips > .label {
  min-width: 56px;
}
.runbar {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: var(--space-3);
  padding: 10px var(--space-6);
  background: var(--bg-chrome);
  border: 1px solid var(--line-seam);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.pad {
  padding: 10px var(--space-4) var(--space-4);
}
.grow {
  flex: 1 1 240px;
}
.warn {
  margin: var(--space-3) 0 0;
  font-size: var(--text-sm);
  color: var(--status-warning);
}
.progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-3) 0;
}
.progress > :first-child {
  flex-grow: 1;
}
.filters {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
  padding: var(--space-3) 0;
}
.filters > .label {
  margin-right: var(--space-1);
}
.filters .grow {
  flex: 1 1 0;
}
.vsep {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--line-control);
}
.detail {
  display: block;
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.flag {
  color: var(--status-warning);
}
@media (max-width: 640px) {
  .page {
    padding: var(--space-4) var(--space-4) 32px;
  }
  .runbar {
    padding: 10px var(--space-4);
    gap: var(--space-3);
  }
}
</style>
