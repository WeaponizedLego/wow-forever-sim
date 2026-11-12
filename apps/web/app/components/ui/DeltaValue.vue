<script setup lang="ts">
import type { Verdict } from '~/composables/ui-types';

// A difference with its verdict: ▲ blue when it clears the noise floor upward, ▼ orange downward,
// ≈ grey inside the noise. Never green/red. The verdict comes from `noise` (|Δ| below it is noise)
// or is forced with `verdict`. `lowerIsBetter` swaps the colors, not the glyph direction.
const props = withDefaults(
  defineProps<{
    value: number;
    digits?: number;
    unit?: string;
    /** |value| below this is "within noise". 0 = any non-zero value counts. */
    noise?: number;
    verdict?: Verdict;
    /** ± after the value, e.g. the CI of the delta. */
    ci?: number;
    glyph?: boolean;
    /** Word after the value: "Better", "Worse", "Within noise". */
    showVerdict?: boolean;
    lowerIsBetter?: boolean;
    /** Glyph + verdict word only (a verdict column next to a Δ column). */
    hideValue?: boolean;
  }>(),
  {
    digits: 1,
    unit: '',
    noise: 0,
    verdict: undefined,
    ci: undefined,
    glyph: true,
    showVerdict: false,
    lowerIsBetter: false,
    hideValue: false,
  },
);

const v = computed<Verdict>(() => {
  if (props.verdict) return props.verdict;
  if (props.value === 0 || Math.abs(props.value) < props.noise) return 'noise';
  return props.value > 0 ? 'up' : 'down';
});
const good = computed(() => (v.value === 'up') !== props.lowerIsBetter);
const tone = computed(() =>
  v.value === 'noise' || v.value === 'reference' ? v.value : good.value ? 'good' : 'bad',
);
const glyphChar = computed(() => ({ up: '▲', down: '▼', noise: '≈', reference: '●' })[v.value]);
const word = computed(() =>
  v.value === 'reference'
    ? 'Reference'
    : v.value === 'noise'
      ? 'Within noise'
      : good.value
        ? 'Better'
        : 'Worse',
);
</script>

<template>
  <span class="delta" :class="`delta--${tone}`">
    <span v-if="glyph" class="num delta__glyph" aria-hidden="true">{{ glyphChar }}</span>
    <span v-if="!hideValue" class="num">{{ formatSigned(value, digits) }}{{ unit }}</span>
    <span v-if="ci !== undefined && !hideValue" class="num delta__ci">±{{ formatNumber(ci, digits) }}</span>
    <span :class="showVerdict ? 'delta__word' : 'visually-hidden'">{{ word }}</span>
  </span>
</template>

<style scoped>
.delta {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}
.delta__glyph {
  font-size: 0.85em;
}
.delta__ci {
  color: var(--text-3);
  font-size: 0.92em;
}
.delta--good {
  color: var(--delta-up);
}
.delta--bad {
  color: var(--delta-down);
}
.delta--noise {
  color: var(--text-2);
}
.delta--noise .delta__glyph,
.delta--noise .delta__word {
  color: var(--text-3);
}
.delta--reference {
  color: var(--text-3);
}
</style>
