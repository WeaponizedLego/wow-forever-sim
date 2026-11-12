<script setup lang="ts">
import type { Encounter } from '@fsim/contracts';

// Encounter settings: fight length and its spread, number and level of targets, execute phase.
const wb = useWorkbench();
const session = useSession();

const enc = computed(() => wb.draft.value?.encounter);

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
    if (!problem.value && n !== enc.value?.[key]) set(key, n);
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
</script>

<template>
  <UiPanel title="Fight" :span="8" :row-span="3">
    <template #meta
      ><span class="num"
        >{{ enc?.durationSec }} s · {{ enc?.targetCount }}
        {{ enc?.targetCount === 1 ? 'target' : 'targets' }}</span
      ></template
    >
    <div class="grid">
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
  </UiPanel>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5) var(--space-6);
  padding: var(--space-4);
}
.span2 {
  grid-column: 1 / -1;
}
.hint {
  margin: 6px 0 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
