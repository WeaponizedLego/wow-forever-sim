<script setup lang="ts">
// primary: inverted (light on dark), one per view · secondary: 1px outline · quiet: text only.
// Pass `to` to render a link that looks like a button. `kbd` shows a shortcut hint.
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'quiet';
    size?: 'sm' | 'md' | 'lg';
    to?: string;
    kbd?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }>(),
  { variant: 'secondary', size: 'md', to: undefined, kbd: undefined, type: 'button', disabled: false },
);
</script>

<template>
  <NuxtLink v-if="to && !disabled" :to="to" class="btn" :class="[`btn--${variant}`, `btn--${size}`]">
    <slot />
    <UiKbd v-if="kbd" :keys="kbd" :inverted="variant === 'primary'" />
  </NuxtLink>
  <button v-else :type="type" class="btn" :class="[`btn--${variant}`, `btn--${size}`]" :disabled="disabled">
    <slot />
    <UiKbd v-if="kbd" :keys="kbd" :inverted="variant === 'primary'" />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-1);
  font: inherit;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.btn--sm {
  height: 26px;
  padding: 0 10px;
  font-size: var(--text-sm);
}
.btn--md {
  height: 30px;
}
.btn--lg {
  height: 32px;
  padding: 0 16px;
}
.btn--secondary:hover:not(:disabled) {
  background: var(--bg-raised);
}
.btn--primary {
  border-color: var(--action-bg);
  background: var(--action-bg);
  color: var(--action-fg);
  font-weight: 500;
  padding-inline: 14px;
}
.btn--primary.btn--lg {
  padding-inline: 16px;
}
.btn--primary:hover:not(:disabled) {
  background: var(--text-2);
  border-color: var(--text-2);
}
.btn--quiet {
  border-color: transparent;
  color: var(--text-2);
}
.btn--quiet:hover:not(:disabled) {
  color: var(--text-1);
  background: var(--bg-raised);
}
.btn:disabled {
  cursor: not-allowed;
  color: var(--text-disabled);
  border-color: var(--line-seam);
}
.btn--primary:disabled {
  background: var(--bg-raised);
  border-color: var(--bg-raised);
}
</style>
