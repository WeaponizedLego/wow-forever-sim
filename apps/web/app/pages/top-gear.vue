<script setup lang="ts">
// Top gear (docs/features.md §4): every combination of candidate items, simmed with one shared seed and
// ranked against the equipped set.
import { ITEM_SLOTS, type ItemSlotId } from '@fsim/contracts';
import { classColorVar } from '@fsim/gamedata';
import type { RankedRow } from '~/composables/topGear';

useHead({ title: 'Top gear · forever/sim' });

const session = useSession();
const engine = useEngine();
const tg = useTopGear();
const char = computed(() => session.character.value);

const ITERATION_OPTIONS = [
  { value: '1000', label: '1k', mono: true },
  { value: '2000', label: '2k', mono: true },
  { value: '5000', label: '5k', mono: true },
  { value: '10000', label: '10k', mono: true },
];
const iterations = ref('2000');
// Open on the results when a finished batch is still around (leaving the screen keeps it).
const editing = ref(tg.batch.value?.status !== 'done');
const runError = ref<string | null>(null);
const equipping = ref(false);

const batch = computed(() => tg.batch.value);
const running = computed(() => batch.value?.status === 'running');
watch(
  () => batch.value?.status,
  (s) => {
    if (s === 'done') editing.value = false;
  },
);

const slotRows = computed(() =>
  ITEM_SLOTS.map((slot) => ({
    slot,
    label: TOP_GEAR_SLOT_LABELS[slot],
    equipped: char.value?.gear[slot]?.itemId ?? null,
    suffix: char.value?.gear[slot]?.randomSuffix,
  })),
);
const slotTag = (s: ItemSlotId) => TOP_GEAR_SLOT_LABELS[s].toUpperCase();

async function search(slot: ItemSlotId, text: string) {
  const c = char.value;
  if (!c) return [];
  const idx = await engine.itemSearch();
  return idx
    .search({ text, slot, class: c.class, spec: c.spec, maxRequiredLevel: c.level, limit: 60 })
    .filter((i) => i.randomSuffixOptions.length === 0)
    .slice(0, 30);
}

const tooMany = computed(() => tg.count.value > TOP_GEAR_MAX_COMBOS);
async function start() {
  runError.value = null;
  try {
    await tg.run(Number(iterations.value));
  } catch (e) {
    runError.value = e instanceof Error ? e.message : String(e);
  }
}

// ---- ranking view
const slotFilter = ref<Partial<Record<ItemSlotId, boolean>>>({});
const batchSlots = computed(() => {
  const b = batch.value;
  if (!b) return [];
  const used = new Set(b.combos.flatMap((c) => c.changes.map((x) => x.slot)));
  return ITEM_SLOTS.filter((s) => used.has(s)).map((slot) => ({
    slot,
    count: new Set(b.combos.flatMap((c) => c.changes.filter((x) => x.slot === slot).map((x) => x.itemId)))
      .size,
  }));
});
const slotOn = (s: ItemSlotId) => slotFilter.value[s] !== false;
const hideNoise = ref(false);
const visible = computed(() =>
  tg.ranking.value.filter(
    (r) =>
      r.equipped || ((!hideNoise.value || r.verdict !== 'noise') && r.changes.every((c) => slotOn(c.slot))),
  ),
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

const ref0 = computed(() => tg.reference.value);
const typicalNoise = computed(() => {
  const rows = tg.ranking.value.filter((r) => !r.equipped);
  if (!rows.length) return null;
  const sorted = rows.map((r) => r.noise).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
});

const headerItems = computed(() => {
  const b = batch.value;
  if (!b || !ref0.value) return [];
  const rows = tg.ranking.value;
  const atBase = rows.find((r) => r.n === b.iterations);
  const rerun = rows.filter((r) => r.n !== b.iterations);
  const perCombo = [
    `${formatNumber(b.iterations, 0)} it`,
    ...(atBase ? [`CI ±${formatNumber(atBase.ci95, 1)}`] : []),
    ...(rerun.length ? [`${rerun.length} at ${formatNumber(rerun[0]!.n / 1000, 0)}k`] : []),
  ];
  return [
    { label: 'Fights simmed', value: formatNumber(b.fights, 0) },
    { label: 'Per combo', value: perCombo.join(' · ') },
    ...(typicalNoise.value === null
      ? []
      : [{ label: 'Noise floor', value: `|Δ| < ${formatNumber(typicalNoise.value, 1)}` }]),
    { label: 'Seed', value: String(b.seed) },
    { label: 'Wall', value: formatDuration(b.wallMs) },
  ];
});
const meta = computed(() => {
  const b = batch.value;
  const n = tg.candidateCount.value;
  const s = tg.slotsWithCandidates.value.length;
  const combos = b && !editing.value ? b.combos.length : tg.count.value;
  return `${n} candidate${n === 1 ? '' : 's'} in ${s} slot${s === 1 ? '' : 's'} → ${formatNumber(combos, 0)} combinations`;
});

function formatDuration(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${formatNumber(s, 1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

async function equip(row: RankedRow) {
  equipping.value = true;
  try {
    await tg.equip(row.changes);
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
      body="Top gear compares items on the character you are working on. Import one or start from a spec first."
    >
      <UiButton variant="primary" to="/">New run</UiButton>
    </UiEmptyState>

    <template v-else>
      <UiPageHeader
        title="Top gear"
        :subtitle="`· ${char.name || 'Character'}`"
        :meta="meta"
        :marker="char.class"
        :items="editing ? [] : headerItems"
      >
        <template #actions>
          <UiButton v-if="batch && !editing" :disabled="running" @click="editing = true"
            >Edit candidates</UiButton
          >
          <UiButton
            v-if="batch && !editing"
            variant="primary"
            :disabled="running || !ref0"
            @click="tg.rerunTop()"
            >Re-run top 5 at 25k</UiButton
          >
        </template>
      </UiPageHeader>

      <UiPanelGrid v-if="editing">
        <UiPanel title="Candidates" :span="12">
          <template #meta>
            <span class="sans">Add items per slot. Every mix of equipped and candidates is simmed.</span>
          </template>
          <TopGearCandidatePicker
            :slots="slotRows"
            :candidates="tg.candidates.value"
            :search="search"
            @add="tg.addCandidate"
            @remove="tg.removeCandidate"
          />
        </UiPanel>
      </UiPanelGrid>

      <div v-if="editing" class="runbar">
        <UiSegmentedControl v-model="iterations" label="Iterations" :options="ITERATION_OPTIONS" />
        <span class="num note">
          {{ formatNumber(tg.count.value, 0) }} combinations ·
          {{ formatNumber(tg.count.value * Number(iterations), 0) }} fights
        </span>
        <span class="note grow">
          Every combination runs with the same seed (common random numbers), so differences come from the
          gear, not from luck. Enchants carry over where they fit the new item.
        </span>
        <UiButton v-if="batch && !running" variant="quiet" @click="editing = false">Back to results</UiButton>
        <UiButton
          variant="primary"
          size="lg"
          :disabled="running || tg.count.value < 2 || tooMany"
          @click="start"
          >{{
            tg.count.value < 2
              ? 'Add a candidate to run'
              : `Run ${formatNumber(tg.count.value, 0)} combinations`
          }}</UiButton
        >
      </div>
      <p v-if="editing && tooMany" class="warn">
        {{ formatNumber(tg.count.value, 0) }} combinations is more than the {{ TOP_GEAR_MAX_COMBOS }} a batch
        runs. Remove candidates to bring it under.
      </p>
      <p v-if="runError || batch?.error" class="warn">{{ runError ?? batch?.error }}</p>

      <div v-if="running && batch" class="progress">
        <UiProgressBar
          :label="`Combination ${Math.min(batch.done + 1, batch.total)} of ${batch.total}`"
          :value="batch.progress"
          :detail="formatDuration(batch.wallMs)"
        />
        <UiButton variant="quiet" size="sm" @click="tg.cancel()">Cancel</UiButton>
      </div>
      <p v-if="batch?.status === 'cancelled'" class="note">
        Cancelled: {{ batch.done }} of {{ batch.total }} combinations finished.
      </p>

      <template v-if="!editing && tg.ranking.value.length && ref0">
        <div class="filters">
          <span class="label">Slots</span>
          <UiFilterChip
            v-for="s in batchSlots"
            :key="s.slot"
            :model-value="slotOn(s.slot)"
            :count="s.count"
            @update:model-value="(v: boolean) => (slotFilter = { ...slotFilter, [s.slot]: v })"
            >{{ TOP_GEAR_SLOT_LABELS[s.slot] }}</UiFilterChip
          >
          <span class="vsep" aria-hidden="true" />
          <UiCheckbox v-model="hideNoise">Hide results within noise</UiCheckbox>
          <span class="grow" />
          <span class="num note"
            >showing {{ visible.length }} of {{ tg.ranking.value.length }} · sorted by mean</span
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
              @equip="equip"
            />
            <p class="note pad">
              Verdict: Welch's t-test against the equipped set, counted only when |Δ| also clears the noise
              floor (1.96 × the combined standard error). The test treats runs as independent; with a shared
              seed they are not, so it errs on the side of "within noise".
            </p>
          </UiPanel>

          <UiPanelStack :span="3">
            <TopGearWinsPanel :total="tg.inWins.value.total" :items="tg.inWins.value.items" />
            <TopGearBestPerSlot
              :rows="tg.bestPerSlot.value"
              :slot-label="(s: ItemSlotId) => TOP_GEAR_SLOT_LABELS[s]"
            />
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
.sans {
  font-family: var(--font-sans);
  color: var(--text-2);
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
  font-size: var(--text-xs);
  color: var(--text-3);
}
.pad {
  margin: 0;
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
