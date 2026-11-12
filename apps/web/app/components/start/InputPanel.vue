<script setup lang="ts">
import type { LineMarker } from '~/composables/ui-types';

// Paste box. Markers come from the parse result (see startLineMarkers).
defineProps<{ span: number; markers: Record<number, LineMarker> }>();
const model = defineModel<string>({ required: true });
</script>

<template>
  <UiPanel title="Input" :span="span">
    <template #meta>
      <span>SimC string · WoWSims JSON · Wowhead planner URL</span>
    </template>
    <UiCodeInput
      v-model="model"
      label="Pasted export"
      :markers="markers"
      placeholder="Paste the output of /simc, a WoWSims export or a Wowhead gear planner link"
    />
  </UiPanel>
</template>
