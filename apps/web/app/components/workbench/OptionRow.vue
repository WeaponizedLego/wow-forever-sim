<script setup lang="ts">
// One spec option ("Pet type", "Pet uptime", "Cobra reflexes") as a row: a select for a choice, a small field for
// a number, a checkbox for on/off, and under it what the preset has when the two differ. Rows look like a rotation
// setting's (WorkbenchRotationNumber). A number edits a local copy and commits as soon as the option takes it.
import {
  specOptionFits,
  specOptionShown,
  specOptionStored,
  specOptionText,
  type SpecOptionField,
  type SpecOptionValue,
} from '@fsim/gamedata';

const props = defineProps<{ field: SpecOptionField; value: SpecOptionValue; preset: SpecOptionValue }>();
const emit = defineEmits<{ change: [value: SpecOptionValue] }>();

const id = useId();
const changed = computed(() => props.value !== props.preset);

const text = ref('');
watch(
  () => props.value,
  (v) => {
    if (props.field.kind === 'number') text.value = String(specOptionShown(props.field, Number(v)));
  },
  { immediate: true },
);
// A number input's v-model can hand back a number.
const str = () => String(text.value ?? '');
const problem = computed(() => {
  const f = props.field;
  if (f.kind !== 'number') return null;
  if (str().trim() !== '' && specOptionFits(f, specOptionStored(f, Number(str())))) return null;
  const range = `${specOptionShown(f, f.min)} to ${specOptionShown(f, f.max).toLocaleString('en-US')}`;
  return f.integer ? `A whole number from ${range}.` : `A number from ${range}.`;
});
watch(text, () => {
  const f = props.field;
  if (f.kind !== 'number' || problem.value) return;
  const stored = specOptionStored(f, Number(str()));
  if (stored !== props.value) emit('change', stored);
});
</script>

<template>
  <div
    class="row"
    :class="{ 'is-changed': changed, 'row--choice': field.kind === 'enum' }"
    :data-option="field.key"
  >
    <UiCheckbox
      v-if="field.kind === 'bool'"
      class="row__check"
      :model-value="value === true"
      @update:model-value="emit('change', $event)"
      >{{ field.label }}</UiCheckbox
    >
    <template v-else-if="field.kind === 'enum'">
      <label class="row__name" :for="id">{{ field.label }}</label>
      <select
        :id="id"
        class="row__select"
        :value="value"
        :aria-describedby="changed ? `${id}-preset` : undefined"
        @change="emit('change', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in field.choices" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </template>
    <template v-else>
      <!-- The field's own (hidden) label names it for assistive technology. -->
      <span class="row__name" aria-hidden="true">{{ field.label }}</span>
      <span class="row__field">
        <UiTextInput
          v-model="text"
          :label="field.unit === '%' ? `${field.label}, percent` : field.label"
          hide-label
          mono
          type="number"
          :invalid="!!problem"
        />
        <span v-if="field.unit" class="row__unit" aria-hidden="true">{{ field.unit }}</span>
      </span>
    </template>
    <span v-if="problem" class="row__hint row__hint--warn" role="alert">{{ problem }}</span>
    <span v-else-if="changed" :id="`${id}-preset`" class="row__hint"
      >preset: {{ specOptionText(field, preset) }}</span
    >
  </div>
</template>

<style scoped>
/* No wider than a name and its control read as one line: in a single wide column the control stays by its name. */
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0 var(--space-3);
  max-width: 34em;
  padding: var(--space-1) 0;
  font-size: var(--text-sm);
  color: var(--text-2);
}
.row.is-changed .row__name,
.row.is-changed :deep(.check) {
  color: var(--text-1);
}
/* The label is the click target: it takes the row, with the room a field's height gives the other rows. */
.row__check {
  grid-column: 1 / -1;
  justify-self: start;
  min-height: var(--control-sm);
}
/* Wide enough for upstream's longest name ("Ancient Sinew Wrapped Lamina") next to the label. */
.row__select {
  width: 17.5em;
  max-width: 100%;
  height: var(--control-sm);
  padding: 0 var(--space-2);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  color: var(--text-1);
  font-size: var(--text-sm);
}
.row__select:hover {
  border-color: var(--line-axis);
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
/* A number without a unit ends where the selects above and below it end. */
.row__unit {
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
/* A phone has no room for a name beside a select: the name goes above it, the select takes the row. */
@media (max-width: 640px) {
  .row--choice {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px 0;
  }
  .row--choice .row__select {
    width: 100%;
  }
}
</style>
