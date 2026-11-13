<script setup lang="ts">
// Fight 1 from the engine's combat log: DPS in 5s buckets, aura lanes, the execute phase and the main
// resource. The engine logs only the first iteration, so this is one fight, not a spread over all.
import type { TimelineLane } from '~/composables/analysis';

const props = defineProps<{
  duration: number;
  points: { x: number; y: number }[];
  yDomain: [number, number];
  xTicks: number[];
  execute: { from: number; to: number } | null;
  runMean: number;
  iterations: number;
  lanes: TimelineLane[];
  /** Auras up the whole fight, not drawn. */
  alwaysOn: number;
  resource: { name: string; points: { x: number; y: number }[]; yDomain: [number, number] } | null;
  showTables?: boolean;
}>();

const yTicks = computed(() => {
  const [lo, hi] = props.yDomain;
  return [lo, (lo + hi) / 2, hi];
});
const fmtS = (v: number) => `${formatNumber(v, 0)}s`;
const label = computed(() => {
  const ys = props.points.map((p) => p.y);
  return `Fight 1 of ${formatNumber(props.iterations, 0)}, ${formatNumber(props.duration, 0)} seconds: DPS per 5 second bucket ranges from ${formatNumber(Math.min(...ys), 0)} to ${formatNumber(Math.max(...ys), 0)}; the run mean over all fights is ${formatNumber(props.runMean, 0)}.`;
});
</script>

<template>
  <UiPanel title="Fight timeline" :span="12">
    <template #meta>
      <ChartsLegend
        :items="[
          { label: 'DPS, 5s buckets', mark: 'line', color: 'var(--series-1)' },
          { label: 'Run mean, all fights', mark: 'dashed', color: 'var(--series-baseline)' },
        ]"
      >
        <span class="sans"
          >fight 1 of {{ formatNumber(iterations, 0) }} · lanes: aura active in this fight<template
            v-if="alwaysOn"
          >
            · {{ alwaysOn }} always-on auras not shown</template
          ></span
        >
      </ChartsLegend>
    </template>
    <div class="timeline">
      <ChartsLineBand
        :points="points"
        :x-domain="[0, duration]"
        :y-domain="yDomain"
        :y-ticks="yTicks"
        :height="160"
        :axis-width="136"
        :axis-gap="12"
        pad="0"
        :baseline="false"
        :region="execute ? { from: execute.from, to: execute.to, label: 'execute phase · 20%' } : undefined"
        :reference="{ y: runMean, label: `run mean ${formatNumber(runMean, 0)}` }"
        :format-x="fmtS"
        :format-y="(v: number) => formatNumber(v, 0)"
        x-label="Time"
        y-label="DPS"
        :label="label"
        :show-table="showTables"
      />
      <ChartsAuraLanes
        v-if="lanes.length"
        :lanes="lanes"
        :duration="duration"
        :x-ticks="xTicks"
        :label="`Aura lanes for fight 1, ${formatNumber(duration, 0)} seconds.`"
        :show-table="showTables"
      >
        <template v-if="resource" #after>
          <ChartsLineBand
            :points="resource.points"
            :x-domain="[0, duration]"
            :y-domain="resource.yDomain"
            :height="48"
            :axis-width="136"
            :axis-gap="12"
            pad="4px 0 0"
            :axis-title="resource.name"
            tone="muted"
            :baseline="false"
            :format-x="fmtS"
            :format-y="(v: number) => formatNumber(v, 0)"
            x-label="Time"
            :y-label="resource.name"
            :label="`${resource.name} over fight 1.`"
            :show-table="showTables"
            class="resource"
          />
        </template>
      </ChartsAuraLanes>
      <p v-else class="note">No auras were logged for the player in fight 1.</p>
    </div>
  </UiPanel>
</template>

<style scoped>
.timeline {
  padding: var(--space-4) 18px 10px;
}
.resource {
  border-top: 1px solid var(--line-row);
}
.sans {
  font-family: var(--font-sans);
  color: var(--text-2);
}
.note {
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .timeline {
    padding: var(--space-3) var(--space-3) 10px;
  }
}
</style>
