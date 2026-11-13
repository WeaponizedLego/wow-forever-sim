<script setup lang="ts">
// A line with an optional uncertainty band (lo/hi per point). Used for convergence (log x),
// DPS over time (with a shaded phase and a dashed fight-mean reference), resource lines and
// scaling curves (with a highlighted "you" point and a vertical marker at a cap).
// Crosshair tooltip on hover and on keyboard focus (←/→).
interface Point {
  x: number;
  y: number;
  lo?: number;
  hi?: number;
}
const props = withDefaults(
  defineProps<{
    points: Point[];
    yDomain: [number, number];
    xDomain?: [number, number];
    xScale?: 'linear' | 'log';
    yTicks?: number[];
    xTicks?: { value: number; label: string }[];
    height?: number;
    /** 'series': 2px --series-1 line, band in the same hue · 'muted': 1.25px secondary-ink line. */
    tone?: 'series' | 'muted';
    region?: { from: number; to: number; label?: string };
    reference?: { y: number; label?: string };
    marker?: { x: number; label?: string };
    highlight?: { x: number; y: number; label: string };
    formatX?: (v: number) => string;
    formatY?: (v: number) => string;
    xLabel?: string;
    yLabel?: string;
    bandLabel?: string;
    /** One-sentence summary for screen readers. */
    label: string;
    axisTitle?: string;
    axisWidth?: number;
    axisGap?: number;
    pad?: string;
    showTable?: boolean;
    /** Draw the bottom axis line. */
    baseline?: boolean;
    /** Side of the marker line its label sits on. */
    markerAlign?: 'left' | 'right';
  }>(),
  {
    xDomain: undefined,
    xScale: 'linear',
    yTicks: () => [],
    xTicks: () => [],
    height: 220,
    tone: 'series',
    region: undefined,
    reference: undefined,
    marker: undefined,
    highlight: undefined,
    formatX: (v: number) => formatNumber(v, 0),
    formatY: (v: number) => formatNumber(v, 1),
    xLabel: 'x',
    yLabel: 'y',
    bandLabel: '95% CI',
    axisTitle: undefined,
    axisWidth: 34,
    axisGap: 8,
    pad: '18px 18px 8px 10px',
    showTable: false,
    baseline: true,
    markerAlign: 'right',
  },
);

const frame = ref<{ width: number } | null>(null);
const width = computed(() => frame.value?.width ?? 600);
const xd = computed<[number, number]>(
  () => props.xDomain ?? [props.points[0]?.x ?? 0, props.points.at(-1)?.x ?? 1],
);
const fx = computed(() =>
  props.xScale === 'log'
    ? logScale(xd.value[0], xd.value[1], 0, 1)
    : linearScale(xd.value[0], xd.value[1], 0, 1),
);
const fy = computed(() => linearScale(props.yDomain[0], props.yDomain[1], 1, 0));
const sy = (v: number) => clamp(fy.value(v), 0, 1) * props.height;

const geo = computed(() => {
  const W = width.value;
  const sx = (v: number) => fx.value(v) * W;
  const xs = props.points.map((p) => sx(p.x));
  const line = props.points.map((p, i) => `${i ? 'L' : 'M'}${xs[i]} ${sy(p.y)}`).join('');
  let band = '';
  if (props.points.length && props.points.every((p) => p.lo !== undefined && p.hi !== undefined)) {
    const up = props.points.map((p, i) => `${xs[i]} ${sy(p.hi!)}`);
    const dn = props.points.map((p, i) => `${xs[i]} ${sy(p.lo!)}`).reverse();
    band = `M${up.join('L')}L${dn.join('L')}Z`;
  }
  return { sx, xs, line, band };
});

const yTickList = computed(() => props.yTicks.map((v) => ({ at: sy(v), label: props.formatY(v) })));
const xTickList = computed(() => props.xTicks.map((t) => ({ at: fx.value(t.value), label: t.label })));

const { active, onKeydown, onFocus, onBlur } = useChartCursor(() => props.points.length);
const focused = ref(false);
function onMove(e: PointerEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  active.value = nearestIndex(geo.value.xs, e.clientX - rect.left);
}
const ap = computed(() => (active.value === null ? undefined : props.points[active.value]));
const ciText = (p: Point) =>
  p.lo !== undefined && p.hi !== undefined ? `${props.formatY(p.lo)} – ${props.formatY(p.hi)}` : '';
const live = computed(() =>
  focused.value && ap.value
    ? `${props.xLabel} ${props.formatX(ap.value.x)}: ${props.yLabel} ${props.formatY(ap.value.y)}` +
      (ciText(ap.value) ? `, ${props.bandLabel} ${ciText(ap.value)}` : '')
    : '',
);

const hasBand = computed(() => props.points.some((p) => p.lo !== undefined));
const tableCols = computed(() => [
  { key: 'x', label: props.xLabel, numeric: true },
  { key: 'y', label: props.yLabel, numeric: true },
  ...(hasBand.value ? [{ key: 'ci', label: props.bandLabel, numeric: true }] : []),
]);
const tableRows = computed(() =>
  props.points.map((p) => ({ x: props.formatX(p.x), y: props.formatY(p.y), ci: ciText(p) })),
);
</script>

<template>
  <div>
    <ChartsFrame
      v-if="!showTable"
      ref="frame"
      :height="height"
      :y-ticks="yTickList"
      :x-ticks="xTickList"
      :axis-title="axisTitle"
      :axis-width="axisWidth"
      :axis-gap="axisGap"
      :pad="pad"
    >
      <div
        class="hit"
        role="group"
        aria-roledescription="chart"
        tabindex="0"
        :aria-label="`${label} Arrow keys step through points.`"
        @pointermove="onMove"
        @pointerleave="active = null"
        @keydown="onKeydown"
        @focus="
          focused = true;
          onFocus();
        "
        @blur="
          focused = false;
          onBlur();
        "
      >
        <svg
          :viewBox="`0 0 ${width} ${height}`"
          :width="width"
          :height="height"
          class="svg"
          aria-hidden="true"
        >
          <rect
            v-if="region"
            :x="geo.sx(region.from)"
            y="0"
            :width="Math.max(0, geo.sx(region.to) - geo.sx(region.from))"
            :height="height"
            class="region"
          />
          <line
            v-for="t in yTickList"
            :key="t.at"
            x1="0"
            :x2="width"
            :y1="Math.round(t.at) + 0.5"
            :y2="Math.round(t.at) + 0.5"
            class="grid"
          />
          <path v-if="geo.band" :d="geo.band" class="band" :class="`band--${tone}`" />
          <path :d="geo.line" class="line" :class="`line--${tone}`" />
          <line
            v-if="reference"
            x1="0"
            :x2="width"
            :y1="sy(reference.y) + 0.5"
            :y2="sy(reference.y) + 0.5"
            class="ref"
          />
          <line v-if="marker" :x1="geo.sx(marker.x)" :x2="geo.sx(marker.x)" y1="0" :y2="height" class="ref" />
          <line v-if="baseline" x1="0" :x2="width" :y1="height - 0.5" :y2="height - 0.5" class="axis" />
          <template v-if="ap">
            <line :x1="geo.sx(ap.x)" :x2="geo.sx(ap.x)" y1="0" :y2="height" class="cross" />
            <circle :cx="geo.sx(ap.x)" :cy="sy(ap.y)" r="4" class="dot" :class="`dot--${tone}`" />
          </template>
          <circle
            v-if="highlight"
            :cx="geo.sx(highlight.x)"
            :cy="sy(highlight.y)"
            r="4.5"
            class="dot dot--you"
          />
        </svg>
        <span v-if="region?.label" class="num lbl lbl--region">{{ region.label }}</span>
        <span
          v-if="reference?.label"
          class="num lbl lbl--ref"
          :style="{ top: `${sy(reference.y) - 16}px` }"
          >{{ reference.label }}</span
        >
        <span
          v-if="marker?.label"
          class="num lbl lbl--marker"
          :class="{ 'lbl--marker-left': markerAlign === 'left' }"
          :style="{ left: pct(fx(marker.x)) }"
          >{{ marker.label }}</span
        >
        <span
          v-if="highlight"
          class="num lbl lbl--you"
          :style="{ left: pct(fx(highlight.x)), top: `${sy(highlight.y)}px` }"
          >{{ highlight.label }}</span
        >
        <ChartsTooltip
          v-if="ap"
          :x="geo.sx(ap.x)"
          :y="Math.min(height - 64, Math.max(0, sy(ap.y) - 28))"
          :width="width"
          :title="`${xLabel} ${formatX(ap.x)}`"
        >
          <ChartsTooltipRow :label="yLabel" :value="formatY(ap.y)" />
          <ChartsTooltipRow v-if="ciText(ap)" :label="bandLabel" :value="ciText(ap)" />
        </ChartsTooltip>
        <span class="visually-hidden" aria-live="polite">{{ live }}</span>
      </div>
    </ChartsFrame>
    <ChartsDataTable :caption="label" :columns="tableCols" :rows="tableRows" :visible="showTable" />
  </div>
</template>

<style scoped>
.hit {
  position: relative;
  height: 100%;
}
.hit:focus-visible {
  outline-offset: 4px;
}
.svg {
  display: block;
  overflow: visible;
}
.region {
  fill: var(--chart-region);
}
.grid {
  stroke: var(--line-seam);
}
.axis {
  stroke: var(--line-axis);
}
.band--series {
  fill: var(--series-1);
  opacity: 0.2;
}
.band--muted {
  fill: var(--series-baseline);
  opacity: 0.15;
}
.line {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.line--series {
  stroke: var(--series-1);
  stroke-width: 2;
}
.line--muted {
  stroke: var(--series-baseline);
  stroke-width: 1.25;
}
.ref {
  stroke: var(--text-3);
  stroke-dasharray: 2 3;
}
.cross {
  stroke: var(--line-axis);
}
.dot {
  stroke: var(--bg-panel);
  stroke-width: 2;
}
.dot--series {
  fill: var(--series-1);
}
.dot--muted {
  fill: var(--series-baseline);
}
.dot--you {
  fill: var(--text-1);
}
.lbl {
  position: absolute;
  font-size: 10px;
  color: var(--text-2);
  white-space: nowrap;
  pointer-events: none;
}
.lbl--region {
  right: var(--space-2);
  top: 6px;
}
.lbl--ref {
  left: 6px;
}
.lbl--marker {
  top: 2px;
  transform: translateX(6px);
}
.lbl--marker-left {
  transform: translateX(calc(-100% - 6px));
}
.lbl--you {
  color: var(--text-1);
  transform: translate(calc(-100% - 8px), 4px);
}
</style>
