<script setup lang="ts">
// Rule-based notes on the run (@fsim/analysis DEFAULT_RULES).
import type { RunNote } from '@fsim/analysis';
import type { CheckItem } from '~/composables/ui-types';

const props = defineProps<{ notes: RunNote[] }>();

const items = computed<CheckItem[]>(() => {
  if (props.notes.length === 0)
    return [
      {
        status: 'good',
        text: 'No rule fired: no resource overflowing its cap, no items missing from the game data, no major cooldowns overlapping in fight 1.',
      },
    ];
  return props.notes.map((n) => ({
    status: n.severity === 'info' ? 'info' : 'warning',
    code: n.id,
    text: n.text,
    ...(n.action && { action: { label: n.action, to: '/workbench' } }),
  }));
});
</script>

<template>
  <UiPanel title="Run notes" :span="12">
    <template #meta><span class="sans">Rule-based checks on this run's metrics</span></template>
    <UiCheckList :items="items" />
    <p class="note">
      Hit cap check (HIT-01) is not run: the engine does not report the hit cap for this fight. Use Hit
      scaling to see where hit stops paying.
    </p>
  </UiPanel>
</template>

<style scoped>
.sans {
  font-family: var(--font-sans);
  color: var(--text-2);
}
.note {
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
