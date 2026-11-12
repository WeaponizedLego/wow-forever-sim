<script setup lang="ts">
// One-of-N choice as joined buttons (aria-pressed), with a visible or hidden group label.
withDefaults(
  defineProps<{
    label: string;
    options: { value: string; label: string; mono?: boolean }[];
    hideLabel?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { hideLabel: false, size: 'md' },
);
const model = defineModel<string>({ required: true });
</script>

<template>
  <fieldset class="seg-field">
    <legend class="label" :class="{ 'visually-hidden': hideLabel }">{{ label }}</legend>
    <div class="seg" :class="`seg--${size}`">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="seg__btn"
        :class="{ num: o.mono }"
        :aria-pressed="model === o.value"
        @click="model = o.value"
      >
        {{ o.label }}
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.seg-field {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
legend {
  float: left;
  margin-right: 0;
}
.seg {
  display: flex;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.seg__btn {
  height: 30px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-size: var(--text-sm);
  cursor: pointer;
  white-space: nowrap;
}
.seg--sm .seg__btn {
  height: 24px;
  padding: 0 8px;
  font-size: var(--text-xs);
}
.seg__btn + .seg__btn {
  border-left: 1px solid var(--line-control);
}
.seg__btn:hover {
  color: var(--text-1);
}
.seg__btn[aria-pressed='true'] {
  background: var(--bg-pressed);
  color: var(--text-1);
}
.seg__btn:focus-visible {
  outline-offset: -2px;
}
</style>
