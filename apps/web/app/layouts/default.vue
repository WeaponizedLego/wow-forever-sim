<script setup lang="ts">
// Shared frame for every product screen: top bar with main nav, the command palette (⌘K) and live
// engine/data status. `nav` is the one list of pages: the top bar and the palette's Navigation section
// both read it, so a page added here shows up in both.
const route = useRoute();
const engine = useEngine();
const session = useSession();
const palette = usePalette();

const nav = computed(() => [
  {
    label: 'Runs',
    to: session.latest.value ? `/runs/${session.latest.value.record.id.replace(/^#/, '')}` : '/runs',
  },
  { label: 'Workbench', to: '/workbench' },
  { label: 'Top gear', to: '/top-gear' },
  { label: 'Droptimizer', to: '/droptimizer' },
  { label: 'Compare', to: '/compare' },
  { label: 'New run', to: '/' },
]);
// The section is the first path segment, so /runs/#0004 highlights "Runs".
const section = (path: string) => `/${path.split('/')[1] ?? ''}`;
const current = computed(() => nav.value.find((n) => section(n.to) === section(route.path))?.to);

const status = computed(() => {
  const s = engine.staged.value;
  if (engine.status.value === 'unavailable') return { tone: 'warning' as const, text: 'engine unavailable' };
  if (engine.status.value === 'error') return { tone: 'warning' as const, text: 'engine failed to load' };
  if (!s) return { tone: 'info' as const, text: 'loading engine' };
  return { tone: 'good' as const, text: `engine ${s.engineId} · data ${s.dataBuild ?? 'unknown'}` };
});
</script>

<template>
  <UiAppChrome :nav="nav" :current="current" :status="status">
    <template #search><PaletteTrigger /></template>
  </UiAppChrome>
  <slot />
  <LazyPaletteCommandPalette v-if="palette.open.value" :nav="nav" />
  <footer class="footer">
    Simulation engine:
    <a href="https://github.com/wowsims/forever">WoWSims Forever</a> (MIT). Not affiliated with Blizzard
    Entertainment.
  </footer>
</template>

<style scoped>
.footer {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) var(--space-6);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.footer a {
  color: var(--text-2);
}
</style>
