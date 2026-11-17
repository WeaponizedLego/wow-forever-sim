<script setup lang="ts">
// The top bar's search button. It opens the command palette, as ⌘K / Ctrl+K does from anywhere.
const palette = usePalette();
const mac = ref(true);

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    palette.toggle();
  }
}
onMounted(() => {
  mac.value = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <button
    type="button"
    class="trigger"
    aria-haspopup="dialog"
    :aria-expanded="palette.open.value"
    aria-label="Search or run a command"
    aria-keyshortcuts="Meta+K Control+K"
    @click="palette.show()"
  >
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.3" />
      <path d="M7.8 7.8L11 11" stroke="currentColor" stroke-width="1.3" />
    </svg>
    <span class="trigger__text">Search…</span>
    <UiKbd class="trigger__kbd" aria-hidden="true" :keys="mac ? '⌘K' : 'Ctrl K'" />
  </button>
</template>

<style scoped>
.trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 15rem;
  height: var(--control-sm);
  padding: 0 var(--space-2);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-3);
  font-size: var(--text-sm);
  cursor: pointer;
}
.trigger:hover {
  border-color: var(--line-control);
  color: var(--text-2);
}
.trigger__text {
  flex-grow: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 1100px) {
  .trigger {
    width: var(--control-sm);
    justify-content: center;
    padding: 0;
  }
  .trigger__text,
  .trigger__kbd {
    display: none;
  }
}
</style>
