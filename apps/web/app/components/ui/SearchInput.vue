<script setup lang="ts">
// Search field with a magnifier and a shortcut hint. `bindShortcut` focuses it on ⌘K / Ctrl+K.
const props = withDefaults(
  defineProps<{ label?: string; placeholder?: string; kbd?: string; bindShortcut?: boolean }>(),
  { label: 'Search', placeholder: undefined, kbd: undefined, bindShortcut: false },
);
const model = defineModel<string>({ default: '' });
const input = ref<HTMLInputElement | null>(null);

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    input.value?.focus();
  }
}
onMounted(() => props.bindShortcut && window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <label class="search">
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.3" />
      <path d="M7.8 7.8L11 11" stroke="currentColor" stroke-width="1.3" />
    </svg>
    <span class="visually-hidden">{{ label }}</span>
    <input
      ref="input"
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-keyshortcuts="bindShortcut ? 'Meta+K Control+K' : undefined"
    />
    <UiKbd v-if="kbd" :keys="kbd" />
  </label>
</template>

<style scoped>
.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 26px;
  padding: 0 var(--space-2);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-control);
  color: var(--text-3);
  font-size: var(--text-sm);
}
.search:hover {
  border-color: var(--line-control);
}
.search:focus-within {
  border-color: var(--line-axis);
  outline: 2px solid var(--series-1);
  outline-offset: 1px;
}
input {
  flex-grow: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-1);
  font: inherit;
}
input::placeholder {
  color: var(--text-3);
}
input::-webkit-search-cancel-button {
  display: none;
}
</style>
