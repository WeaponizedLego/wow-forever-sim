<script setup lang="ts">
// Attack outcomes of one ability as one bar: hit / crit / glance / miss+dodge, in that fixed order
// and fixed colors, with 2px surface gaps. Values are percentages (they need not sum to exactly 100).
// Hover or focus shows all four. Legend: use OUTCOME_LEGEND in the panel header.
const props = withDefaults(
  defineProps<{
    outcomes: { hit: number; crit: number; glance: number; miss: number };
    /** Ability name, for the tooltip and the accessible label. */
    name: string;
    height?: number;
  }>(),
  { height: 10 },
);
const parts = computed(() =>
  (
    [
      ['hit', 'Hit', 'var(--series-1)'],
      ['crit', 'Crit', 'var(--series-2)'],
      ['glance', 'Glance', 'var(--series-3)'],
      ['miss', 'Miss / dodge', 'var(--series-muted)'],
    ] as const
  ).map(([key, label, color]) => ({ key, label, color, value: props.outcomes[key] })),
);
const aria = computed(
  () =>
    `${props.name} outcomes: ` + parts.value.map((p) => `${p.label} ${formatNumber(p.value, 1)}%`).join(', '),
);
</script>

<template>
  <UiTooltip block>
    <template #default="{ describedby }">
      <span
        class="bar"
        role="img"
        tabindex="0"
        :aria-label="aria"
        :aria-describedby="describedby"
        :style="{ height: `${height}px` }"
      >
        <span
          v-for="p in parts.filter((p) => p.value > 0)"
          :key="p.key"
          class="seg"
          :style="{ flexGrow: p.value, background: p.color }"
        />
      </span>
    </template>
    <template #content>
      <div class="num tip-title">{{ name }}</div>
      <ChartsTooltipRow
        v-for="p in parts"
        :key="p.key"
        :label="p.label"
        :value="`${formatNumber(p.value, 1)}%`"
        :color="p.color"
      />
    </template>
  </UiTooltip>
</template>

<style scoped>
.bar {
  display: flex;
  gap: 2px;
  width: 100%;
  min-width: 80px;
}
.bar:focus-visible {
  outline-offset: 3px;
}
.seg {
  flex-basis: 0;
  min-width: 2px;
  border-radius: var(--radius-mark);
}
.tip-title {
  margin-bottom: var(--space-1);
  min-width: 150px;
}
</style>
