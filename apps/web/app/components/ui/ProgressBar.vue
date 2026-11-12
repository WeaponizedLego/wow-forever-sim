<script setup lang="ts">
// Sim progress: label, mono detail (iterations, CI so far, ETA), and a thin bar.
// `value` is 0–1; leave it undefined for an indeterminate phase (e.g. "loading engine").
const props = withDefaults(
  defineProps<{ label: string; value?: number; detail?: string; state?: 'running' | 'done' | 'error' }>(),
  { value: undefined, detail: undefined, state: 'running' },
);
const pctText = computed(() => (props.value === undefined ? undefined : formatPercent(props.value, 0)));
</script>

<template>
  <div class="progress">
    <div class="progress__head">
      <span class="progress__label">
        <UiStatusGlyph v-if="state === 'done'" status="good" hide-label label="Done" />
        <UiStatusGlyph v-else-if="state === 'error'" status="warning" hide-label label="Failed" />
        {{ label }}
      </span>
      <span class="num progress__detail"
        >{{ detail }}<template v-if="pctText && detail"> · </template>{{ pctText }}</span
      >
    </div>
    <div
      class="progress__track"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="value === undefined ? undefined : Math.round(value * 100)"
      :aria-valuetext="detail"
    >
      <span
        class="progress__fill"
        :class="{ 'progress__fill--indet': value === undefined, 'progress__fill--done': state === 'done' }"
        :style="value === undefined ? undefined : { width: `${Math.min(1, Math.max(0, value)) * 100}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.progress__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
  font-size: var(--text-sm);
}
.progress__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.progress__detail {
  font-size: var(--text-xs);
  color: var(--text-3);
  white-space: nowrap;
}
.progress__track {
  position: relative;
  height: 4px;
  margin-top: 6px;
  background: var(--bg-raised);
  border-radius: var(--radius-mark);
  overflow: hidden;
}
.progress__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--series-1);
  border-radius: var(--radius-mark);
  transition: width 0.2s linear;
}
.progress__fill--done {
  background: var(--series-neutral);
}
.progress__fill--indet {
  width: 30%;
  animation: slide 1.4s ease-in-out infinite;
}
@keyframes slide {
  from {
    left: -30%;
  }
  to {
    left: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .progress__fill--indet {
    animation: none;
    width: 100%;
    opacity: 0.35;
  }
  .progress__fill {
    transition: none;
  }
}
</style>
