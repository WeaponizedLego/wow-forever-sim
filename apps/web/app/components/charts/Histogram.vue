<script setup lang="ts">
// Distribution of a run: bars (share of iterations per bin), the baseline run as a dashed step
// outline over the same bins, mean lines for both, and the p5–p95 range as a faint band.
// y is share of iterations so runs with different n compare directly.
const props = withDefaults(
  defineProps<{
    /** Bins in ascending order; `count` is iterations in [lo, hi). */
    bins: { lo: number; hi: number; count: number }[];
    total: number;
    /** Baseline counts on the same bins. */
    baseline?: number[];
    baselineTotal?: number;
    mean: number;
    baselineMean?: number;
    p5?: number;
    p95?: number;
    xTicks?: number[];
    height?: number;
    unit?: string;
    runLabel?: string;
    baselineLabel?: string;
    /** One-sentence summary for screen readers. */
    label: string;
    showTable?: boolean;
  }>(),
  {
    baseline: undefined,
    baselineTotal: undefined,
    baselineMean: undefined,
    p5: undefined,
    p95: undefined,
    xTicks: () => [],
    height: 220,
    unit: 'DPS',
    runLabel: 'Run',
    baselineLabel: 'Baseline',
    showTable: false,
  },
);

const x0 = computed(() => props.bins[0]?.lo ?? 0);
const x1 = computed(() => props.bins.at(-1)?.hi ?? 1);
const share = (count: number, total: number) => (total > 0 ? count / total : 0);
const baseTotal = computed(() => props.baselineTotal ?? props.total);

const yMax = computed(() => {
  let m = 0;
  for (const b of props.bins) m = Math.max(m, share(b.count, props.total));
  for (const c of props.baseline ?? []) m = Math.max(m, share(c, baseTotal.value));
  return Math.max(1, Math.ceil(m * 100 * 1.08)); // percent
});
const yTicks = computed(() => {
  const h = props.height;
  const half = yMax.value / 2;
  return [
    { at: 0, label: `${yMax.value}%` },
    { at: h / 2, label: `${Number.isInteger(half) ? half : half.toFixed(1)}%` },
    { at: h, label: '0' },
  ];
});
const frac = (v: number) => (v - x0.value) / (x1.value - x0.value || 1);
const xTickList = computed(() => props.xTicks.map((v) => ({ at: frac(v), label: formatNumber(v, 0) })));

const frame = ref<{ width: number } | null>(null);
const width = computed(() => frame.value?.width ?? 600);

const g = computed(() => {
  const W = width.value;
  const H = props.height;
  const sx = linearScale(x0.value, x1.value, 0, W);
  const sy = (s: number) => H - ((s * 100) / yMax.value) * H;
  let bars = '';
  for (const b of props.bins) {
    const xa = sx(b.lo) + 1;
    const w = Math.max(0.5, sx(b.hi) - sx(b.lo) - 2); // 2px surface gap between bars
    const y = sy(share(b.count, props.total));
    if (y >= H) continue;
    const r = Math.min(2, w / 2, H - y);
    bars += `M${xa} ${H}V${y + r}Q${xa} ${y} ${xa + r} ${y}H${xa + w - r}Q${xa + w} ${y} ${xa + w} ${y + r}V${H}Z`;
  }
  let base = '';
  (props.baseline ?? []).forEach((c, i) => {
    const b = props.bins[i];
    if (!b) return;
    const y = sy(share(c, baseTotal.value));
    base += (i === 0 ? `M${sx(b.lo)} ${y}` : `V${y}`) + `H${sx(b.hi)}`;
  });
  return { sx, sy, bars, base, H };
});

const { active, onKeydown, onFocus, onBlur } = useChartCursor(() => props.bins.length);
const focused = ref(false);

function onMove(e: PointerEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const v = x0.value + ((e.clientX - rect.left) / rect.width) * (x1.value - x0.value);
  const i = props.bins.findIndex((b) => v >= b.lo && v < b.hi);
  active.value = i < 0 ? null : i;
}

const rangeText = (i: number) => {
  const b = props.bins[i]!;
  return `${formatNumber(b.lo, 0)} – ${formatNumber(b.hi, 0)} ${props.unit}`;
};
const runText = (i: number) => {
  const c = props.bins[i]!.count;
  return `${formatNumber(c, 0)} it · ${formatPercent(share(c, props.total))}`;
};
const baseText = (i: number) => {
  const c = props.baseline?.[i] ?? 0;
  return `${formatNumber(c, 0)} it · ${formatPercent(share(c, baseTotal.value))}`;
};
const live = computed(() =>
  focused.value && active.value !== null
    ? `${rangeText(active.value)}: ${props.runLabel} ${runText(active.value)}` +
      (props.baseline ? `, ${props.baselineLabel} ${baseText(active.value)}` : '')
    : '',
);

const tableCols = computed(() => [
  { key: 'range', label: props.unit },
  { key: 'run', label: `${props.runLabel} (it)`, numeric: true },
  { key: 'runPct', label: `${props.runLabel} (%)`, numeric: true },
  ...(props.baseline
    ? [
        { key: 'base', label: `${props.baselineLabel} (it)`, numeric: true },
        { key: 'basePct', label: `${props.baselineLabel} (%)`, numeric: true },
      ]
    : []),
]);
const tableRows = computed(() =>
  props.bins.map((b, i) => ({
    range: rangeText(i),
    run: formatNumber(b.count, 0),
    runPct: formatPercent(share(b.count, props.total)),
    base: formatNumber(props.baseline?.[i] ?? 0, 0),
    basePct: formatPercent(share(props.baseline?.[i] ?? 0, baseTotal.value)),
  })),
);
</script>

<template>
  <div>
    <ChartsFrame v-if="!showTable" ref="frame" :height="height" :y-ticks="yTicks" :x-ticks="xTickList">
      <div
        class="hit"
        tabindex="0"
        :aria-label="`${label} Arrow keys step through bins.`"
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
          <line :x1="0" :x2="width" :y1="height / 2" :y2="height / 2" class="grid" />
          <rect
            v-if="p5 !== undefined && p95 !== undefined"
            :x="g.sx(p5)"
            y="0"
            :width="Math.max(0, g.sx(p95) - g.sx(p5))"
            :height="height"
            class="band"
          />
          <rect
            v-if="active !== null && bins[active]"
            :x="g.sx(bins[active]!.lo)"
            y="0"
            :width="g.sx(bins[active]!.hi) - g.sx(bins[active]!.lo)"
            :height="height"
            class="hover"
          />
          <path :d="g.bars" class="bars" />
          <path v-if="baseline" :d="g.base" class="base" />
          <line :x1="g.sx(mean)" :x2="g.sx(mean)" y1="0" :y2="height" class="mean" />
          <line
            v-if="baselineMean !== undefined"
            :x1="g.sx(baselineMean)"
            :x2="g.sx(baselineMean)"
            y1="0"
            :y2="height"
            class="base-mean"
          />
          <line x1="0" :x2="width" :y1="height - 0.5" :y2="height - 0.5" class="axis" />
        </svg>
        <span class="num lbl lbl--mean" :style="{ left: pct(frac(mean)) }"
          >mean {{ formatNumber(mean, 1) }}</span
        >
        <span
          v-if="baselineMean !== undefined"
          class="num lbl lbl--base"
          :style="{ left: pct(frac(baselineMean)) }"
          >{{ formatNumber(baselineMean, 1) }}</span
        >
        <span v-if="p5 !== undefined" class="num lbl lbl--p5" :style="{ left: pct(frac(p5)) }">p5</span>
        <span v-if="p95 !== undefined" class="num lbl lbl--p95" :style="{ left: pct(frac(p95)) }">p95</span>
        <ChartsTooltip
          v-if="active !== null && bins[active]"
          :x="((frac(bins[active]!.lo) + frac(bins[active]!.hi)) / 2) * width"
          :y="Math.min(height - 80, Math.max(0, g.sy(share(bins[active]!.count, total)) - 20))"
          :width="width"
          :title="rangeText(active)"
          :box-width="180"
        >
          <ChartsTooltipRow :label="runLabel" :value="runText(active)" color="var(--series-1)" />
          <ChartsTooltipRow
            v-if="baseline"
            :label="baselineLabel"
            :value="baseText(active)"
            color="var(--series-baseline)"
            dashed
          />
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
.grid {
  stroke: var(--line-seam);
}
.axis {
  stroke: var(--line-axis);
}
.band {
  fill: var(--series-1);
  opacity: 0.06;
}
.hover {
  fill: var(--chart-hover);
}
.bars {
  fill: var(--series-1);
}
.base {
  fill: none;
  stroke: var(--series-baseline);
  stroke-width: 1.25;
  stroke-dasharray: 3 3;
}
.mean {
  stroke: var(--text-1);
}
.base-mean {
  stroke: var(--series-baseline);
  stroke-dasharray: 2 3;
}
.lbl {
  position: absolute;
  font-size: var(--text-xs);
  white-space: nowrap;
  pointer-events: none;
}
.lbl--mean {
  top: -2px;
  transform: translateX(6px);
}
.lbl--base {
  top: 14px;
  transform: translateX(calc(-100% - 6px));
  color: var(--text-2);
}
.lbl--p5,
.lbl--p95 {
  bottom: 4px;
  font-size: 10px;
  color: var(--text-3);
}
.lbl--p5 {
  transform: translateX(4px);
}
.lbl--p95 {
  transform: translateX(calc(-100% - 4px));
}
</style>
