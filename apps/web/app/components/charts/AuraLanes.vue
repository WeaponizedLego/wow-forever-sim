<script setup lang="ts">
// Rows of active windows on a shared time axis (aura and cooldown uptime). Each lane is a focusable
// row; hover or focus shows its uptime and windows. Put a LineBand above with the same
// `labelWidth`/`gap` (as axisWidth/axisGap) to share the time axis, like the fight timeline;
// the #after slot (e.g. a resource line) sits between the lanes and the time axis.
interface Lane {
  name: string;
  /** 0–1 share of the fight (or of iterations) the aura is active. */
  uptime: number;
  /** [start, end] in the same unit as `duration`. */
  segments: [number, number][];
}
const props = withDefaults(
  defineProps<{
    lanes: Lane[];
    duration: number;
    xTicks?: number[];
    unit?: string;
    labelWidth?: number;
    gap?: number;
    /** One-sentence summary for screen readers. */
    label: string;
    showTable?: boolean;
  }>(),
  { xTicks: () => [], unit: 's', labelWidth: 136, gap: 12, showTable: false },
);

const at = (t: number) => clamp(t / props.duration, 0, 1);
const open = ref<number | null>(null);
const seg = ref<[number, number] | null>(null);
const track = ref<HTMLElement[]>([]);
const trackWidth = () => track.value[0]?.clientWidth || 600;
const t = (v: number) => `${formatNumber(v, 0)}${props.unit}`;
const windows = (l: Lane) => `${l.segments.length} window${l.segments.length === 1 ? '' : 's'}`;

function xAlign(f: number) {
  if (f <= 0.02) return 'translateX(0)';
  if (f >= 0.98) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

const tableRows = computed(() =>
  props.lanes.map((l) => ({
    name: l.name,
    uptime: formatPercent(l.uptime),
    windows: l.segments.map(([a, b]) => `${t(a)}–${t(b)}`).join(', '),
  })),
);
const tableCols = [
  { key: 'name', label: 'Aura' },
  { key: 'uptime', label: 'Uptime', numeric: true },
  { key: 'windows', label: 'Active windows' },
];
</script>

<template>
  <div>
    <div v-if="!showTable" class="lanes" :style="{ '--label-w': `${labelWidth}px`, columnGap: `${gap}px` }">
      <template v-for="(lane, i) in lanes" :key="lane.name">
        <div class="lane__label">
          <span class="lane__name">{{ lane.name }}</span>
          <span class="num lane__up">{{ formatPercent(lane.uptime, lane.uptime < 0.2 ? 1 : 0) }}</span>
        </div>
        <div
          ref="track"
          class="lane__track"
          tabindex="0"
          :aria-label="`${lane.name}: active ${formatPercent(lane.uptime)} of the fight, ${windows(lane)}.`"
          @mouseenter="open = i"
          @mouseleave="
            open = null;
            seg = null;
          "
          @focus="open = i"
          @blur="open = null"
        >
          <span
            v-for="(s, k) in lane.segments"
            :key="k"
            class="lane__seg"
            :style="{ left: pct(at(s[0])), width: pct(at(s[1]) - at(s[0])) }"
            @mouseenter="seg = s"
            @mouseleave="seg = null"
          />
          <ChartsTooltip
            v-if="open === i"
            :x="seg ? at((seg[0] + seg[1]) / 2) * trackWidth() : trackWidth() / 2"
            :y="18"
            :width="trackWidth()"
            :title="lane.name"
          >
            <ChartsTooltipRow label="Uptime" :value="formatPercent(lane.uptime)" />
            <ChartsTooltipRow label="Windows" :value="formatNumber(lane.segments.length, 0)" />
            <ChartsTooltipRow v-if="seg" label="This window" :value="`${t(seg[0])} – ${t(seg[1])}`" />
          </ChartsTooltip>
        </div>
      </template>
      <div v-if="$slots.after" class="lanes__after"><slot name="after" /></div>
      <template v-if="xTicks.length">
        <div />
        <div class="num xaxis" aria-hidden="true">
          <span
            v-for="x in xTicks"
            :key="x"
            class="xaxis__tick"
            :style="{ left: pct(at(x)), transform: xAlign(at(x)) }"
            >{{ t(x) }}</span
          >
        </div>
      </template>
    </div>
    <ChartsDataTable :caption="label" :columns="tableCols" :rows="tableRows" :visible="showTable" />
  </div>
</template>

<style scoped>
.lanes {
  display: grid;
  grid-template-columns: var(--label-w) minmax(0, 1fr);
}
@media (max-width: 640px) {
  .lanes {
    grid-template-columns: min(var(--label-w), 92px) minmax(0, 1fr);
  }
}
.lane__label {
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  border-top: 1px solid var(--line-row);
  font-size: var(--text-sm);
  color: var(--text-2);
  min-width: 0;
}
.lane__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lane__up {
  font-size: 10px;
  color: var(--text-3);
}
.lane__track {
  position: relative;
  height: 22px;
  border-top: 1px solid var(--line-row);
}
.lane__track:hover,
.lane__track:focus-visible {
  background: var(--chart-hover);
}
.lane__track:focus-visible {
  outline-offset: -2px;
}
.lane__seg {
  position: absolute;
  top: 6px;
  height: 10px;
  min-width: 1px;
  background: var(--series-lane);
  border-radius: var(--radius-mark);
}
.lane__seg:hover {
  background: var(--series-neutral);
}
.lanes__after {
  grid-column: 1 / -1;
}
.xaxis {
  position: relative;
  height: 20px;
  padding-top: var(--space-1);
  border-top: 1px solid var(--line-row);
  font-size: 10px;
  color: var(--text-3);
}
.xaxis__tick {
  position: absolute;
  top: var(--space-1);
  white-space: nowrap;
}
</style>
