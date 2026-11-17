<script setup lang="ts">
import { fightStyle, type Encounter } from '@fsim/contracts';
import { effectiveEncounter, fightSegments } from '@fsim/gamedata';

// A fight's pulls on a time axis: one lane per pull (pack or boss) with the window its mobs are alive.
const props = withDefaults(defineProps<{ encounter: Encounter; showTable?: boolean }>(), {
  showTable: false,
});

const duration = computed(() => effectiveEncounter(props.encounter).durationSec);
const sliced = computed(() => fightStyle(props.encounter.style).segments.length > 0);
const lanes = computed(() =>
  fightSegments(props.encounter).map((s) => ({
    name: sliced.value ? `${s.label} · ${s.mobs} ${s.mobs === 1 ? 'mob' : 'mobs'}` : s.label,
    uptime: (s.endSec - s.startSec) / duration.value,
    segments: [[s.startSec, s.endSec]] as [number, number][],
  })),
);
const ticks = computed(() => {
  const d = duration.value;
  const step = d > 240 ? 60 : d > 90 ? 30 : 15;
  const out: number[] = [];
  for (let t = 0; t <= d; t += step) out.push(t);
  return out;
});
const summary = computed(() => {
  const segs = fightSegments(props.encounter);
  const up = segs.reduce((a, s) => a + s.endSec - s.startSec, 0);
  return segs.length === 1
    ? `${lanes.value[0]!.name} for the whole ${duration.value} s fight.`
    : `${segs.length} pulls over ${duration.value} s, ${duration.value - up} s of downtime between them.`;
});
</script>

<template>
  <ChartsAuraLanes
    :lanes="lanes"
    :duration="duration"
    :x-ticks="ticks"
    :label-width="120"
    :label="summary"
    :show-table="showTable"
  />
</template>
