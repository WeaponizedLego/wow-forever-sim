<script setup lang="ts">
// Value against a threshold (hit cap, skill cap, crit ceiling): bar on a track with a 2px marker at
// the threshold. The fill is --series-1 once the threshold is reached, neutral below it.
const props = withDefaults(
  defineProps<{
    label: string;
    value: number;
    cap: number;
    /** Right end of the track. */
    max: number;
    /** Mono text on the right: "9.0 / 9.0%". */
    valueText: string;
    note?: string;
  }>(),
  { note: undefined },
);
const f = (v: number) => clamp(v / (props.max || 1), 0, 1);
const reached = computed(() => props.value >= props.cap);
</script>

<template>
  <div class="cap">
    <div class="cap__head">
      <span>{{ label }}</span
      ><span class="num cap__value">{{ valueText }}</span>
    </div>
    <UiTooltip block class="cap__tipwrap">
      <template #default="{ describedby }">
        <div
          class="cap__track"
          role="meter"
          tabindex="0"
          :aria-label="label"
          :aria-valuenow="value"
          aria-valuemin="0"
          :aria-valuemax="max"
          :aria-valuetext="`${valueText}${reached ? ', at threshold' : ''}`"
          :aria-describedby="describedby"
        >
          <span
            class="cap__fill"
            :class="{ 'cap__fill--reached': reached }"
            :style="{ width: pct(f(value)) }"
          />
          <span class="cap__mark" :style="{ left: pct(f(cap)) }" />
        </div>
      </template>
      <template #content>
        <ChartsTooltipRow label="Value" :value="formatNumber(value, 1)" />
        <ChartsTooltipRow label="Threshold" :value="formatNumber(cap, 1)" />
        <ChartsTooltipRow
          :label="reached ? 'Over by' : 'Headroom'"
          :value="formatNumber(Math.abs(cap - value), 1)"
        />
      </template>
    </UiTooltip>
    <div v-if="note" class="cap__note">{{ note }}</div>
  </div>
</template>

<style scoped>
.cap__head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
}
.cap__value {
  color: var(--text-2);
}
.cap__tipwrap {
  display: flex;
  margin-top: 6px;
}
.cap__track {
  position: relative;
  width: 100%;
  height: 8px;
  background: var(--bg-raised);
  border-radius: var(--radius-mark);
}
.cap__track:focus-visible {
  outline-offset: 4px;
}
.cap__fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 8px;
  background: var(--series-neutral);
  border-radius: var(--radius-mark);
}
.cap__fill--reached {
  background: var(--series-1);
}
.cap__mark {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 14px;
  margin-left: -1px;
  background: var(--text-1);
}
.cap__note {
  margin-top: 5px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
