<script setup lang="ts">
import type { CheckItem } from '~/composables/ui-types';

// List of rule results: status icon, optional code, text, optional location and action.
// Used for run notes (Analysis) and the parse report (Start).
withDefaults(defineProps<{ items: CheckItem[]; dense?: boolean }>(), { dense: false });
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
  grid-template-columns: 22px 64px minmax(0, 1fr) auto;
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
