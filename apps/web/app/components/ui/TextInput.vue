<script setup lang="ts">
// Single-line text field with a label (visible above, or hidden). `mono` for numbers and ids.
withDefaults(
  defineProps<{
    label: string;
    hideLabel?: boolean;
    placeholder?: string;
    mono?: boolean;
    type?: 'text' | 'number' | 'url';
    invalid?: boolean;
    hint?: string;
  }>(),
  { hideLabel: false, placeholder: undefined, mono: false, type: 'text', invalid: false, hint: undefined },
);
const model = defineModel<string>({ default: '' });
const id = useId();
</script>

<template>
  <div class="field">
    <label :for="id" class="label" :class="{ 'visually-hidden': hideLabel }">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type"
      class="input"
      :class="{ num: mono, 'input--invalid': invalid }"
      :placeholder="placeholder"
      :aria-invalid="invalid || undefined"
      :aria-describedby="hint ? `${id}-hint` : undefined"
    />
    <div v-if="hint" :id="`${id}-hint`" class="hint">
      <UiStatusGlyph v-if="invalid" status="warning" hide-label />
      {{ hint }}
    </div>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.input {
  height: 30px;
  padding: 0 var(--space-2);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  font-size: var(--text-md);
  min-width: 0;
}
.input::placeholder {
  color: var(--text-3);
}
.input:hover {
  border-color: var(--line-axis);
}
.input:focus-visible {
  outline-offset: 0;
}
.input--invalid {
  border-color: var(--status-warning);
}
.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
