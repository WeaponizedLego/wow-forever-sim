<script setup lang="ts">
import type { LineMarker } from '~/composables/ui-types';

// Paste box, with where each accepted export comes from. Markers come from the parse result (see startLineMarkers).
defineProps<{ span: number; markers: Record<number, LineMarker> }>();
const model = defineModel<string>({ required: true });

// One line: the code input is as tall as its text, so further placeholder lines would be cut off.
const PLACEHOLDER = 'Paste /simc output, a WoWSims export or a wowhead.com/forever/gear-planner link';
</script>

<template>
  <UiPanel title="Input" :span="span">
    <template #meta>
      <span>SimC string · WoWSims JSON · Wowhead planner link</span>
    </template>
    <UiCodeInput v-model="model" label="Pasted export" :markers="markers" :placeholder="PLACEHOLDER" />
    <p class="help">
      In game: <code class="num">/simc</code> (SimulationCraft addon) or the WoWSims exporter. On the web:
      open your build in Wowhead's
      <a href="https://www.wowhead.com/forever/gear-planner" target="_blank" rel="noopener"
        >WoW Forever gear planner</a
      >
      and copy the page address.
    </p>
  </UiPanel>
</template>

<style scoped>
.help {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--line-row);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.help a {
  color: var(--text-2);
}
</style>
