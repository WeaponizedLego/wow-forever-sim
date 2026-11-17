<script setup lang="ts">
// An error for people: one readable line (engine panics mapped by @fsim/engine `describeEngineError`),
// with the raw engine text (Go stack trace and all) folded into a "Details" disclosure.
// Takes the error as text, the way screens keep it (`engineErrorText(e)`); plain messages show as they are.
import { describeEngineError } from '@fsim/engine';

const props = defineProps<{ text: string }>();
const info = computed(() => describeEngineError(props.text));
</script>

<template>
  <span class="error-text">
    <span class="error-text__msg">{{ info.message }}</span>
    <details v-if="info.detail" class="error-text__details">
      <summary>Details</summary>
      <pre class="error-text__raw">{{ info.detail }}</pre>
    </details>
  </span>
</template>

<style scoped>
.error-text {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.error-text__details summary {
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.error-text__raw {
  margin: var(--space-1) 0 0;
  max-height: 240px;
  max-width: min(100%, 90ch);
  overflow: auto;
  padding: var(--space-2);
  border: 1px solid var(--line-seam);
  background: var(--bg-chrome);
  color: var(--text-2);
  font-size: var(--text-xs);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
