<script setup lang="ts">
import type { NavItem, Status } from '~/composables/ui-types';

// Top bar: wordmark, main nav, optional search, data/engine status.
const props = withDefaults(
  defineProps<{
    nav: NavItem[];
    /** `to` of the current section; that link gets aria-current="page". */
    current?: string;
    status?: { tone: Status; text: string; to?: string };
    search?: boolean;
    home?: string;
  }>(),
  { current: undefined, status: undefined, search: false, home: '/' },
);
const query = defineModel<string>('query', { default: '' });
</script>

<template>
  <header class="chrome">
    <div class="chrome__inner">
      <NuxtLink :to="props.home" class="num wordmark"
        >forever<span class="wordmark__slash">/</span>sim</NuxtLink
      >
      <nav aria-label="Main" class="nav">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav__link"
          :aria-current="item.to === current ? 'page' : undefined"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <UiSearchInput
        v-if="search"
        v-model="query"
        class="search"
        label="Search"
        placeholder="Items, specs, runs"
        kbd="⌘K"
        bind-shortcut
      />
      <component
        :is="status.to ? 'a' : 'span'"
        v-if="status"
        :href="status.to"
        class="num status"
        :class="`status--${status.tone}`"
      >
        <span class="status__dot" aria-hidden="true" />
        <span class="visually-hidden">Data status {{ status.tone }}:</span>
        <span class="status__text">{{ status.text }}</span>
      </component>
    </div>
  </header>
</template>

<style scoped>
.chrome {
  height: var(--chrome-height);
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--line-seam);
}
.chrome__inner {
  max-width: var(--page-max);
  height: 100%;
  margin: 0 auto;
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  gap: 20px;
}
.wordmark {
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}
.wordmark__slash {
  color: var(--text-3);
}
.nav {
  display: flex;
  gap: 2px;
  flex-grow: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.nav__link {
  padding: 4px 10px;
  border-radius: var(--radius-control);
  color: var(--text-2);
  text-decoration: none;
  white-space: nowrap;
}
.nav__link:hover {
  color: var(--text-1);
}
.nav__link[aria-current='page'] {
  background: var(--bg-raised);
  color: var(--text-1);
}
.search {
  width: 260px;
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-2);
  text-decoration: none;
  white-space: nowrap;
}
.status__dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--status-good);
}
.status--warning .status__dot {
  background: var(--status-warning);
}
.status--info .status__dot {
  background: var(--status-info);
}
@media (max-width: 900px) {
  .search {
    display: none;
  }
}
@media (max-width: 640px) {
  .chrome__inner {
    padding: 0 var(--space-5);
    gap: var(--space-3);
  }
  .status__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
