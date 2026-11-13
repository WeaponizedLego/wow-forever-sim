<script setup lang="ts">
import type { ClassId } from '@fsim/contracts';

// ± change around zero, one row per item (e.g. DPS change per spec since a data build). Gains in
// --series-1 to the right, losses in --series-2 to the left. Rows flow into `columns` columns.
// Keyboard: focus the chart, ←/→ step rows.
interface Row {
  label: string;
  value: number;
  marker?: ClassId;
}
const props = withDefaults(
  defineProps<{
    rows: Row[];
    /** Absolute value at the bar ends. */
    max?: number;
    columns?: 1 | 2;
    format?: (v: number) => string;
    /** One-sentence summary for screen readers. */
    label: string;
    valueLabel?: string;
    showTable?: boolean;
  }>(),
  {
    max: 5,
    columns: 2,
    format: (v: number) => `${formatSigned(v, 1)}%`,
    valueLabel: 'Change',
    showTable: false,
  },
);
const w = (v: number) => (Math.min(Math.abs(v), props.max) / props.max) * 50;
const { active, onKeydown, onFocus, onBlur } = useChartCursor(() => props.rows.length);
const focused = ref(false);
const live = computed(() => {
  const r = active.value === null ? undefined : props.rows[active.value];
  return focused.value && r ? `${r.label}: ${props.format(r.value)}` : '';
});
const tableRows = computed(() => props.rows.map((r) => ({ label: r.label, value: props.format(r.value) })));
</script>

<template>
  <div>
    <div
      v-if="!showTable"
      class="div"
      :class="`div--${columns}`"
      tabindex="0"
      :aria-label="`${label} Arrow keys step through rows.`"
      @keydown="onKeydown"
      @focus="
        focused = true;
        onFocus();
      "
      @blur="
        focused = false;
        onBlur();
      "
      @mouseleave="active = null"
    >
      <div
        v-for="(r, i) in rows"
        :key="r.label"
        class="row"
        :class="{ 'row--active': active === i }"
        aria-hidden="true"
        @mouseenter="active = i"
      >
        <span class="row__label"><UiClassMarker v-if="r.marker" :cls="r.marker" />{{ r.label }}</span>
        <span class="row__plot">
          <span class="zero" />
          <span
            class="bar"
            :class="r.value >= 0 ? 'bar--gain' : 'bar--loss'"
            :style="{ left: `${r.value >= 0 ? 50 : 50 - w(r.value)}%`, width: `${w(r.value)}%` }"
          />
          <ChartsTooltip v-if="active === i" :x="0" :y="14" :width="9999" :box-width="160" :title="r.label">
            <ChartsTooltipRow :label="valueLabel" :value="format(r.value)" />
          </ChartsTooltip>
        </span>
        <span class="num row__value">{{ format(r.value) }}</span>
      </div>
      <span class="visually-hidden" aria-live="polite">{{ live }}</span>
    </div>
    <ChartsDataTable
      :caption="label"
      :columns="[
        { key: 'label', label: 'Spec' },
        { key: 'value', label: valueLabel, numeric: true },
      ]"
      :rows="tableRows"
      :visible="showTable"
    />
  </div>
</template>

<style scoped>
.div {
  display: grid;
  column-gap: 28px;
  padding: 10px var(--space-4) var(--space-4);
}
.div:focus-visible {
  outline-offset: -2px;
}
.div--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) 54px;
  gap: 10px;
  align-items: center;
  padding: var(--space-1) 0;
  font-size: var(--text-sm);
}
.row--active {
  background: var(--chart-hover);
}
.row__label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row__plot {
  position: relative;
  height: 10px;
}
.zero {
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: var(--line-axis);
}
.bar {
  position: absolute;
  top: 1px;
  height: 8px;
  border-radius: var(--radius-mark);
}
.bar--gain {
  background: var(--series-1);
}
.bar--loss {
  background: var(--series-2);
}
.row__value {
  text-align: right;
  color: var(--text-2);
}
@media (max-width: 760px) {
  .div--2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 420px) {
  .row {
    grid-template-columns: 120px minmax(0, 1fr) 48px;
    gap: var(--space-2);
  }
}
</style>
