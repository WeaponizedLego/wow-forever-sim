<script setup lang="ts">
// Tooltip for any trigger. Opens on hover and on keyboard focus inside the trigger; Esc closes.
// The trigger gets aria-describedby through the slot props: <UiTooltip v-slot="{ describedby }">.
// For chart marks inside a plot use ChartsTooltip (charts/Tooltip.vue), which is positioned at a data point instead.
// `block` makes the wrapper full width (for marks that fill a table cell).
const props = withDefaults(defineProps<{ text?: string; placement?: 'top' | 'bottom'; block?: boolean }>(), {
  text: undefined,
  placement: 'top',
  block: false,
});
const id = useId();
const open = ref(false);
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}
</script>

<template>
  <span
    class="tip-wrap"
    :class="{ 'tip-wrap--block': block }"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
    @keydown="onKey"
  >
    <slot :describedby="id" />
    <span v-show="open" :id="id" role="tooltip" class="tip" :class="`tip--${props.placement}`">
      <slot name="content">{{ text }}</slot>
    </span>
  </span>
</template>

<style scoped>
.tip-wrap {
  position: relative;
  display: inline-flex;
}
.tip-wrap--block {
  display: flex;
  width: 100%;
}
.tip {
  position: absolute;
  left: 50%;
  z-index: 20;
  transform: translateX(-50%);
  width: max-content;
  max-width: 260px;
  padding: 6px var(--space-2);
  background: var(--bg-raised);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-tooltip);
  box-shadow: var(--shadow-tooltip);
  color: var(--text-1);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  text-align: left;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;
}
.tip--top {
  bottom: calc(100% + 6px);
}
.tip--bottom {
  top: calc(100% + 6px);
}
</style>
