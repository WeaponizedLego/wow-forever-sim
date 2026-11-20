<script setup lang="ts">
// One numeric rotation setting ("Shoot spot", "Rip minimum fight left") as a row: its name, a small field and its
// unit. Like the Fight tab's fields, it edits a local copy and commits as soon as that is a number the setting takes.
import { MAX_ROTATION_NUMBER, rotationNumberFits, type RotationNumber } from '@fsim/gamedata';

const props = defineProps<{ setting: RotationNumber }>();
const emit = defineEmits<{ change: [value: number] }>();

const text = ref('');
watch(
  () => props.setting.value,
  (v) => (text.value = String(v)),
  { immediate: true },
);
// A number input's v-model can hand back a number.
const str = () => String(text.value ?? '');
const problem = computed(() =>
  str().trim() === '' || !rotationNumberFits(Number(str()))
    ? `A number from 0 to ${MAX_ROTATION_NUMBER.toLocaleString('en-US')}.`
    : null,
);
watch(text, () => {
  const n = Number(str());
  if (!problem.value && n !== props.setting.value) emit('change', n);
});

const UNITS = { '': null, '%': 'percent', s: 'seconds' } as const;
const unit = computed(() => UNITS[props.setting.unit]);
const changed = computed(() => props.setting.value !== props.setting.preset);
</script>

<template>
  <div class="row" :class="{ 'is-changed': changed }">
    <!-- The field's own (hidden) label names it for assistive technology. -->
    <span class="row__name" aria-hidden="true">{{ setting.name }}</span>
    <span class="row__field">
      <UiTextInput
        v-model="text"
        :label="unit ? `${setting.name}, ${unit}` : setting.name"
        hide-label
        mono
        type="number"
        :invalid="!!problem"
      />
      <span class="row__unit" aria-hidden="true">{{ setting.unit }}</span>
    </span>
    <span v-if="problem" class="row__hint row__hint--warn" role="alert">{{ problem }}</span>
    <span v-else-if="changed" class="row__hint">was {{ setting.preset }}{{ setting.unit }}</span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0 var(--space-3);
  padding: var(--space-1) 0;
  font-size: var(--text-sm);
  color: var(--text-2);
}
.row.is-changed .row__name {
  color: var(--text-1);
}
.row__field {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.row__field :deep(.input) {
  width: 5.5em;
  height: var(--control-sm);
  text-align: right;
}
/* Every row keeps the unit's width, so the fields line up whether or not a setting has one. */
.row__unit {
  width: 1em;
  color: var(--text-3);
}
.row__hint {
  grid-column: 1 / -1;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.row__hint--warn {
  color: var(--status-warning);
}
</style>
