<script setup lang="ts">
import type { NavItem, Status } from '~/composables/ui-types';

// Top bar: wordmark, main nav, optional search, data/engine status.
// The `search` slot replaces the built-in search field (the app layout puts the command palette button there).
// Up to 800px wide the links do not fit in the bar, so the nav becomes a disclosure: a Menu button
// (aria-expanded) that opens the links as a full-width list under the bar. Opening it focuses the current page's
// link; Esc closes it and focus goes back to the button; choosing a link, clicking outside or tabbing away closes it.
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

const open = ref(false);
const navEl = ref<HTMLElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);
const listId = useId();
const route = useRoute();
watch(
  () => route.fullPath,
  () => (open.value = false),
);

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  const links = navEl.value?.querySelectorAll<HTMLElement>('.nav__link');
  (navEl.value?.querySelector<HTMLElement>('.nav__link[aria-current="page"]') ?? links?.[0])?.focus();
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return;
  e.preventDefault();
  e.stopPropagation();
  open.value = false;
  toggleEl.value?.focus();
}
// Keyboard focus leaving the nav closes it. A tap (relatedTarget null on touch browsers) is left to onPointerDown,
// so tapping a link is never cut short by the list closing under the finger.
function onFocusOut(e: FocusEvent) {
  const to = e.relatedTarget as Node | null;
  if (open.value && to && !navEl.value?.contains(to)) open.value = false;
}
function onPointerDown(e: PointerEvent) {
  if (!navEl.value?.contains(e.target as Node)) open.value = false;
}
watch(open, (v) =>
  v
    ? document.addEventListener('pointerdown', onPointerDown)
    : document.removeEventListener('pointerdown', onPointerDown),
);
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
  <header class="chrome">
    <div class="chrome__inner">
      <NuxtLink :to="props.home" class="num wordmark"
        >forever<span class="wordmark__slash">/</span>sim</NuxtLink
      >
      <nav
        ref="navEl"
        aria-label="Main"
        class="nav"
        :class="{ 'is-open': open }"
        @keydown="onKeydown"
        @focusout="onFocusOut"
      >
        <button
          ref="toggleEl"
          type="button"
          class="nav__toggle"
          :aria-expanded="open"
          :aria-controls="listId"
          @click="toggle"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              v-if="open"
              d="M3.5 3.5l9 9M12.5 3.5l-9 9"
              stroke="currentColor"
              stroke-width="1.5"
              fill="none"
            />
            <path v-else d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
          Menu
        </button>
        <ul :id="listId" class="nav__list">
          <li v-for="item in nav" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="nav__link"
              :aria-current="item.to === current ? 'page' : undefined"
              @click="open = false"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
      <slot name="search">
        <UiSearchInput
          v-if="search"
          v-model="query"
          class="search"
          label="Search"
          placeholder="Items, specs, runs"
          kbd="⌘K"
          bind-shortcut
        />
      </slot>
      <component
        :is="status.to ? 'a' : 'span'"
        v-if="status"
        :href="status.to"
        class="num status"
        :class="`status--${status.tone}`"
        :title="status.text"
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
  /* The anchor and stacking level of the phone menu's list: over the page and its sticky sim bar. */
  position: relative;
  z-index: 40;
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
  gap: var(--space-5);
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
  flex-grow: 1;
  min-width: 0;
}
.nav__list {
  display: flex;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.nav__toggle {
  display: none;
}
.nav__link {
  display: block;
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
/* Phones and narrow windows: all six links need about 800px, so below that they go behind the Menu button. */
@media (max-width: 800px) {
  .nav {
    display: flex;
    justify-content: flex-end;
  }
  .nav__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--control-sm);
    padding: 0 10px;
    border: 1px solid var(--line-control);
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-1);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .nav__toggle[aria-expanded='true'] {
    background: var(--bg-raised);
  }
  .nav__list {
    display: none;
  }
  .nav.is-open .nav__list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-5) var(--space-3);
    background: var(--bg-chrome);
    border-bottom: 1px solid var(--line-seam);
    box-shadow: var(--shadow-tooltip);
  }
  .nav.is-open .nav__link {
    display: flex;
    align-items: center;
    min-height: 44px; /* touch target */
    padding: 0 var(--space-3);
  }
  .nav.is-open .nav__link[aria-current='page'] {
    box-shadow: inset 2px 0 0 var(--text-1);
  }
}
/* Keep every nav link visible: below 1440px the status shows as its dot (text in the tooltip and for screen readers). */
@media (max-width: 1440px) {
  .status__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
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
