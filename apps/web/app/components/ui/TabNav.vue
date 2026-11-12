<script setup lang="ts">
import type { NavItem } from '~/composables/ui-types';

// Secondary navigation between sub-views (Workbench: Gear · Talents · Buffs …). Links, not tabs:
// each sub-view has its own URL.
defineProps<{ label: string; items: NavItem[]; current?: string }>();
</script>

<template>
  <nav :aria-label="label" class="tabs">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="tab"
      :aria-current="item.to === current ? 'page' : undefined"
    >
      {{ item.label }}<span v-if="item.detail" class="num tab__detail">{{ item.detail }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 2px;
  flex-grow: 1;
  /* safe: when the tabs overflow and scroll, start at the first tab instead of clipping it. */
  justify-content: safe center;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--text-2);
  text-decoration: none;
  white-space: nowrap;
}
.tab:hover {
  color: var(--text-1);
}
.tab[aria-current='page'] {
  border-color: var(--line-control);
  background: var(--bg-raised);
  color: var(--text-1);
}
.tab__detail {
  margin-left: 0.4em;
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .tabs {
    justify-content: flex-start;
    flex-basis: 100%;
  }
}
</style>
