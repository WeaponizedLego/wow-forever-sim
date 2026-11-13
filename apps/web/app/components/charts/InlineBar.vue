<script setup lang="ts">
// Magnitude bar inside a table cell (share of damage, item value), followed by its number.
// `gain` splits off the part that is new in the draft, drawn in --series-1 after a 2px gap.
// The number next to it carries the value, so the bar is decorative (aria-hidden).
const props = withDefaults(
  defineProps<{ value: number; max: number; gain?: number; text?: string; textWidth?: string }>(),
  { gain: 0, text: undefined, textWidth: '44px' },
);
const f = (v: number) => `${clamp(v / (props.max || 1), 0, 1) * 100}%`;
</script>

<template>
  <span class="ib">
    <span class="ib__track" aria-hidden="true">
      <span class="ib__fill" :style="{ width: f(value - gain) }" />
      <span v-if="gain > 0" class="ib__gain" :style="{ width: f(gain) }" />
    </span>
    <span v-if="text" class="num ib__text" :style="{ width: textWidth }">{{ text }}</span>
  </span>
</template>

<style scoped>
.ib {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ib__track {
  flex-grow: 1;
  display: flex;
  gap: 2px;
  height: 8px;
  background: var(--bg-raised);
  border-radius: var(--radius-mark);
}
.ib__fill {
  height: 8px;
  background: var(--series-neutral);
  border-radius: var(--radius-mark);
}
.ib__gain {
  height: 8px;
  background: var(--series-1);
  border-radius: var(--radius-mark);
}
.ib__text {
  flex-shrink: 0;
  text-align: right;
}
</style>
