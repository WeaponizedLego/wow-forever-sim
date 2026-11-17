<script setup lang="ts">
// The app's toast (useToast). A confirmation sits in a polite live region, always in the page so screen readers
// hear each new message, and hides itself. A link to copy by hand (the clipboard refused) comes in a small panel:
// focus moves to the selected link, Copy tries again, Esc or Close dismisses it and focus goes back.
const toast = useToast();
const current = toast.current;
const input = ref<HTMLInputElement | null>(null);
const hint = ref('');
let returnFocus: HTMLElement | null = null;

watch(
  () => current.value?.id,
  async () => {
    hint.value = '';
    if (!current.value?.link) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
);

function close() {
  const el = returnFocus;
  returnFocus = null;
  toast.hide();
  if (el?.isConnected) el.focus();
}

async function copy() {
  const link = current.value?.link;
  if (!link) return;
  input.value?.select();
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    hint.value = 'The browser blocked copying. The link is selected: press ⌘C or Ctrl+C.';
    input.value?.focus();
    return;
  }
  const el = returnFocus;
  returnFocus = null;
  toast.show('Link copied');
  if (el?.isConnected) el.focus();
}
</script>

<template>
  <div class="toasts">
    <div role="status" class="toast" :class="{ 'is-hidden': !current || current.link }" data-testid="toast">
      {{ current && !current.link ? current.text : '' }}
    </div>
    <div
      v-if="current?.link"
      class="toast toast--link"
      role="group"
      aria-labelledby="toast-link-label"
      @keydown.esc.stop="close"
    >
      <label id="toast-link-label" for="toast-link" class="toast__label">{{ current.text }}</label>
      <div class="toast__row">
        <input
          id="toast-link"
          ref="input"
          class="toast__input"
          type="text"
          readonly
          :value="current.link"
          spellcheck="false"
          :aria-describedby="hint ? 'toast-link-hint' : undefined"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <UiButton size="sm" @click="copy">Copy</UiButton>
        <UiButton size="sm" variant="quiet" @click="close">Close</UiButton>
      </div>
      <p v-if="hint" id="toast-link-hint" class="toast__hint" role="alert">{{ hint }}</p>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  z-index: 50; /* over the sticky sim bar, under the command palette */
  top: calc(var(--chrome-height) + var(--space-3));
  right: var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  max-width: calc(100vw - 2 * var(--space-5));
  pointer-events: none;
}
.toast {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-tooltip);
  background: var(--bg-raised);
  box-shadow: var(--shadow-tooltip);
  color: var(--text-1);
  font-size: var(--text-sm);
  pointer-events: auto;
}
/* Stays in the page (an empty live region) so the next message is announced. */
.toast.is-hidden {
  padding: 0;
  border: 0;
  box-shadow: none;
}
.toast--link {
  width: min(32rem, 100%);
  padding: var(--space-3) var(--space-4);
}
.toast__label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--text-2);
}
.toast__row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.toast__input {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--control-sm);
  padding: 0 var(--space-2);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  font-size: var(--text-sm);
}
.toast__hint {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--status-warning);
}
@media (max-width: 640px) {
  .toasts {
    left: var(--space-5);
    align-items: stretch;
  }
}
</style>
