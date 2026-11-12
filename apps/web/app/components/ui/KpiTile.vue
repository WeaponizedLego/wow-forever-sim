<script setup lang="ts">
import type { Verdict } from '~/composables/ui-types';

// Headline number tile in UiPanelGrid. lg = 34px headline (mean, Δ), md = 22px (spread, precision).
// `tone` colors the headline as a delta. #label overrides the label (e.g. to keep a lowercase σ). The #foot slot replaces `foot`, e.g. for a StatusGlyph line.
const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    /** Mono text after the value: "± 3.1", "+1.9%". */
    secondary?: string;
    foot?: string;
    size?: 'lg' | 'md';
    tone?: Verdict;
    span?: number;
  }>(),
  { secondary: undefined, foot: undefined, size: 'lg', tone: undefined, span: 3 },
);
const style = computed(() => gridCellStyle(props.span));
</script>

<template>
  <div class="tile" :style="style">
    <div class="label">
      <slot name="label">{{ label }}</slot>
    </div>
    <div class="value-row" :class="`value-row--${size}`">
      <span class="num value" :class="[`value--${size}`, tone && `tone-${tone}`]">{{ value }}</span>
      <span v-if="secondary" class="num secondary">{{ secondary }}</span>
    </div>
    <div v-if="$slots.foot || foot" class="foot" :class="{ num: !$slots.foot }">
      <slot name="foot">{{ foot }}</slot>
    </div>
  </div>
</template>

<style scoped>
.tile {
  grid-column: span var(--span);
  background: var(--bg-panel);
  padding: var(--space-4);
  min-width: 0;
}
.value-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.value-row--lg {
  margin-top: 6px;
}
.value-row--md {
  margin-top: var(--space-2);
}
.value {
  line-height: 1;
  white-space: nowrap;
}
.value--lg {
  font-size: var(--text-kpi);
  font-weight: 500;
  letter-spacing: -0.03em;
}
.value--md {
  font-size: 22px;
}
.secondary {
  color: var(--text-2);
}
.foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.value-row--lg + .foot {
  margin-top: 6px;
}
.tone-up {
  color: var(--delta-up);
}
.tone-down {
  color: var(--delta-down);
}
@media (max-width: 1100px) {
  .tile {
    grid-column: span var(--span-md);
  }
}
@media (max-width: 640px) {
  .tile {
    grid-column: 1 / -1;
  }
  .value--lg {
    font-size: 28px;
  }
}
</style>
