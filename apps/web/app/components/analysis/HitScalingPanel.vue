<script setup lang="ts">
// DPS at several hit chances around the run's own, on request.
import type { HitScalingState } from '~/composables/analysisHitScaling';

const props = defineProps<{ state: HitScalingState | null; iterations: number; showTables?: boolean }>();
const emit = defineEmits<{ run: []; cancel: [] }>();

const sorted = computed(() => [...(props.state?.points ?? [])].sort((a, b) => a.hit - b.hit));
const points = computed(() =>
  sorted.value.map((p) => ({ x: p.hit, y: p.mean, lo: p.mean - p.ci95, hi: p.mean + p.ci95 })),
);
const xDomain = computed<[number, number]>(() => {
  const xs = points.value.map((p) => p.x);
  return xs.length > 1 ? [Math.min(...xs), Math.max(...xs)] : [0, 1];
});
const yDomain = computed<[number, number]>(() => {
  const lo = Math.min(...points.value.map((p) => p.lo));
  const hi = Math.max(...points.value.map((p) => p.hi));
  const pad = (hi - lo) * 0.1 || 1;
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
});
const yTicks = computed(() => [
  yDomain.value[0],
  (yDomain.value[0] + yDomain.value[1]) / 2,
  yDomain.value[1],
]);
// Whole percents only, at most six, so labels never repeat while points are still arriving.
const xTicks = computed(() => {
  const [lo, hi] = xDomain.value;
  const first = Math.ceil(lo - 1e-9);
  const last = Math.floor(hi + 1e-9);
  const stride = Math.max(1, Math.ceil((last - first) / 5));
  const out: { value: number; label: string }[] = [];
  for (let v = first; v <= last; v += stride) out.push({ value: v, label: `${v}%` });
  return out;
});
const you = computed(() => {
  const s = props.state;
  const p = s?.current === null || !s ? undefined : sorted.value.find((q) => q.rating === 0);
  return p ? { x: p.hit, y: p.mean, label: `you · ${formatNumber(p.hit, 1)}%` } : undefined;
});
const perPoint = computed(() => {
  const ps = sorted.value;
  if (ps.length < 2) return '';
  const first = ps[0]!;
  const last = ps.at(-1)!;
  return `DPS goes from ${formatNumber(first.mean, 0)} at ${formatNumber(first.hit, 1)}% hit to ${formatNumber(last.mean, 0)} at ${formatNumber(last.hit, 1)}%.`;
});
</script>

<template>
  <UiPanel
    title="Hit scaling"
    :meta="
      state?.points.length
        ? `${state.points.length} points · ${formatNumber(state.iterations, 0)} it each`
        : undefined
    "
  >
    <template v-if="state && state.points.length > 1">
      <ChartsLineBand
        :points="points"
        :x-domain="xDomain"
        :y-domain="yDomain"
        :y-ticks="yTicks"
        :x-ticks="xTicks"
        :height="120"
        pad="14px 18px 8px 10px"
        :highlight="you"
        :format-x="(v: number) => `${formatNumber(v, 1)}%`"
        :format-y="(v: number) => formatNumber(v, 1)"
        :x-label="state.label"
        y-label="DPS"
        :label="perPoint"
        :show-table="showTables"
      />
    </template>
    <div class="body">
      <p v-if="!state" class="note">
        Sims this character at up to 9 hit chances around its own ({{ formatNumber(iterations, 0) }}
        iterations each, the run's seed). Hit chance per point is read from the engine's character sheet.
      </p>
      <UiProgressBar
        v-if="state?.status === 'running'"
        :label="`Point ${Math.min(state.points.length + 1, state.total || 1)} of ${state.total || '…'}`"
        :value="state.progress"
      />
      <p v-if="state?.status === 'error'" class="error">{{ state.error }}</p>
      <p v-if="state?.status === 'cancelled'" class="note">
        Cancelled after {{ state.points.length }} points.
      </p>
      <p v-if="state?.status === 'done'" class="note">
        {{ state.label }} on x, read from the engine for each point. The engine does not report a hit cap, so
        none is drawn; a cap shows as the line going flat.
      </p>
      <div class="actions">
        <UiButton v-if="state?.status === 'running'" variant="quiet" size="sm" @click="emit('cancel')"
          >Cancel</UiButton
        >
        <UiButton v-else size="sm" @click="emit('run')">{{
          state ? 'Run again' : 'Run hit scaling'
        }}</UiButton>
      </div>
    </div>
  </UiPanel>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-4);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.actions {
  display: flex;
  gap: 6px;
}
.error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--status-warning);
}
</style>
