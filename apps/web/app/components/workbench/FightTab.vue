<script setup lang="ts">
import { FIGHT_STYLES, fightStyle, type Encounter, type FightStyleId } from '@fsim/contracts';
import { fightLabel, withFightStyle } from '@fsim/gamedata';

// The fight: a style (Patchwerk 3 or 5 min, a dungeon slice, or Custom) and, for Custom, its length and spread,
// number and level of targets and execute phase. Every sim (quick sim, stat weights, top gear, …) runs it.
const wb = useWorkbench();
const session = useSession();

const enc = computed(() => wb.draft.value?.encounter);
const custom = computed(() => enc.value?.style === 'custom');
const info = computed(() => fightStyle(enc.value?.style ?? 'patchwerk-3m'));

const style = computed({
  get: () => enc.value?.style ?? 'patchwerk-3m',
  set: (v: string) =>
    session.updateCharacter((c) => (c.encounter = withFightStyle(c.encounter, v as FightStyleId))),
});

function set<K extends keyof Encounter>(key: K, value: Encounter[K]) {
  session.updateCharacter((c) => (c.encounter[key] = value));
}

// Number fields edit a local copy and commit when valid.
function numberField(key: 'durationSec' | 'durationVariationSec', min: number, max: number) {
  const text = ref('');
  watch(
    () => enc.value?.[key],
    (v) => (text.value = v === undefined ? '' : String(v)),
    { immediate: true },
  );
  // A number input's v-model can hand back a number.
  const str = () => String(text.value ?? '');
  const problem = computed(() => {
    const n = Number(str());
    if (str().trim() === '' || !Number.isFinite(n)) return 'Enter a number of seconds.';
    if (n < min || n > max) return `Between ${min} and ${max} seconds.`;
    return null;
  });
  watch(text, () => {
    const n = Number(str());
    if (custom.value && !problem.value && n !== enc.value?.[key]) set(key, n);
  });
  return { text, problem };
}

const duration = numberField('durationSec', 10, 1200);
const variation = numberField('durationVariationSec', 0, 120);

const targets = computed({
  get: () => String(enc.value?.targetCount ?? 1),
  set: (v: string) => set('targetCount', Number(v)),
});
const level = computed({
  get: () => String(enc.value?.targetLevel ?? 63),
  set: (v: string) => set('targetLevel', Number(v)),
});
const execute = computed({
  get: () => enc.value?.executePhase ?? true,
  set: (v: boolean) => set('executePhase', v),
});

// A preset's fixed values, read-only.
const fixed = computed(() => {
  const e = enc.value;
  if (!e || custom.value) return [];
  const slice = info.value.segments.length > 0;
  return [
    {
      label: 'Duration',
      value: `${e.durationSec} s${e.durationVariationSec ? ` ± ${e.durationVariationSec}` : ''}`,
    },
    {
      label: 'Targets',
      value: slice
        ? `${info.value.segments.reduce((a, s) => a + s.mobs, 0)} mobs, up to ${e.targetCount} at once`
        : String(e.targetCount),
    },
    { label: 'Target level', value: String(e.targetLevel) },
    { label: 'Execute phase', value: e.executePhase ? (slice ? 'last 20% of each mob' : 'last 20%') : 'off' },
  ];
});

const showTable = ref(false);
</script>

<template>
  <UiPanel title="Fight" :span="8" :row-span="3">
    <template #meta
      ><span class="num" data-testid="fight-label">{{ enc ? fightLabel(enc) : '' }}</span></template
    >
    <div class="body">
      <div>
        <UiSegmentedControl
          v-model="style"
          label="Fight style"
          :options="FIGHT_STYLES.map((s) => ({ value: s.id, label: s.label }))"
        />
        <p class="hint">{{ info.description }}</p>
      </div>

      <section v-if="enc" class="timeline" aria-label="Fight schedule">
        <div class="timeline__head">
          <h3 class="label">Schedule</h3>
          <UiButton size="sm" variant="quiet" @click="showTable = !showTable">{{
            showTable ? 'Chart' : 'Table'
          }}</UiButton>
        </div>
        <FightTimeline :encounter="enc" :show-table="showTable" />
      </section>

      <UiKeyValueStrip v-if="!custom" :items="fixed" />

      <div v-else class="grid">
        <UiTextInput
          v-model="duration.text.value"
          label="Duration"
          mono
          type="number"
          :invalid="!!duration.problem.value"
          :hint="duration.problem.value ?? 'Seconds. The average fight length.'"
        />
        <UiTextInput
          v-model="variation.text.value"
          label="± variation"
          mono
          type="number"
          :invalid="!!variation.problem.value"
          :hint="variation.problem.value ?? 'Seconds. Each iteration draws its length from duration ± this.'"
        />
        <div>
          <UiSegmentedControl
            v-model="targets"
            label="Targets"
            :options="[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n), mono: true }))"
          />
          <p class="hint">Identical raid targets; AoE abilities hit all of them.</p>
        </div>
        <div>
          <UiSegmentedControl
            v-model="level"
            label="Target level"
            :options="[60, 61, 62, 63].map((n) => ({ value: String(n), label: String(n), mono: true }))"
          />
          <p class="hint">63 is a raid boss. Level changes miss, glancing and crit suppression.</p>
        </div>
        <div class="span2">
          <UiCheckbox v-model="execute">Execute phase</UiCheckbox>
          <p class="hint">
            Marks the last 20% and 35% of the fight as execute range, for abilities that only work there.
          </p>
        </div>
      </div>
    </div>
  </UiPanel>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-4);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5) var(--space-6);
}
.span2 {
  grid-column: 1 / -1;
}
.hint {
  margin: 6px 0 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.timeline__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.timeline__head h3 {
  margin: 0;
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
