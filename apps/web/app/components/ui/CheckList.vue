<script setup lang="ts">
import type { CheckItem, Status } from '~/composables/ui-types';

// List of rule results: status icon, optional code, text, optional location and action.
// Used for run notes (Analysis) and the parse report (Start). `collapsed` adds one closed row at the end that
// opens onto more items (routine notes that would drown the ones worth reading).
withDefaults(
  defineProps<{
    items: CheckItem[];
    dense?: boolean;
    collapsed?: { summary: string; status: Status; items: CheckItem[] } | null;
  }>(),
  { dense: false, collapsed: null },
);
</script>

<template>
  <ul class="checks" :class="{ 'checks--dense': dense }">
    <li v-for="(item, i) in items" :key="i" class="check" :class="{ 'check--code': item.code }">
      <UiStatusGlyph :status="item.status" hide-label />
      <span v-if="item.code" class="num check__code">{{ item.code }}</span>
      <span class="check__text">{{ item.text }}</span>
      <span v-if="item.where || item.action" class="check__end">
        <span v-if="item.where" class="num check__where">{{ item.where }}</span>
        <NuxtLink v-if="item.action" :to="item.action.to" class="check__action">{{
          item.action.label
        }}</NuxtLink>
      </span>
    </li>
    <li v-if="collapsed && collapsed.items.length" class="check check--group">
      <details class="group">
        <summary class="group__summary">
          <UiStatusGlyph :status="collapsed.status" hide-label />
          <span class="check__text">{{ collapsed.summary }}</span>
        </summary>
        <UiCheckList :items="collapsed.items" :dense="dense" class="group__items" />
      </details>
    </li>
  </ul>
</template>

<style scoped>
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
}
.check {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px var(--space-4);
  border-bottom: 1px solid var(--line-row);
}
.check--code {
  /* 7.5em fits the longest code, "DEFAULT-05", without wrapping, at any text size. */
  grid-template-columns: 22px 7.5em minmax(0, 1fr) auto;
}
.checks--dense {
  padding: 6px 0;
  font-size: var(--text-sm);
}
.checks--dense .check {
  gap: var(--space-2);
  padding: 6px var(--space-4);
  border-bottom: 0;
  align-items: start;
}
.check__code {
  white-space: nowrap;
}
.check__code,
.check__where {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.check__action {
  font-size: var(--text-sm);
  color: var(--text-2);
}
.check__end {
  display: flex;
  gap: var(--space-3);
  white-space: nowrap;
}
.check--group {
  display: block;
}
.group__summary {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: start;
  cursor: pointer;
  color: var(--text-2);
  list-style: none;
}
.group__summary::-webkit-details-marker {
  display: none;
}
.group__summary .check__text::after {
  content: ' ▸';
  color: var(--text-3);
}
.group[open] .group__summary .check__text::after {
  content: ' ▾';
}
.group__items {
  margin: 0 calc(-1 * var(--space-4));
}
@media (max-width: 640px) {
  .check,
  .check--code {
    grid-template-columns: 22px minmax(0, 1fr);
  }
  .check__code {
    grid-column: 2;
  }
  .check__text,
  .check__end {
    grid-column: 2;
  }
}
</style>
