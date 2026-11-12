<script setup lang="ts">
// Dev only: imports the real level-42 shaman export, runs two sims (so the second has a baseline) and
// opens the latest run. Lets the Analysis and Top gear screens be worked on without the Start screen.
import shamanSimc from '../../../../../fixtures/import/real/simc-shaman-lvl42.simc?raw';

useHead({ title: 'Seed runs · forever/sim' });

const session = useSession();
const route = useRoute();
const status = ref('Importing the shaman export…');
const iterations = Number(route.query.iterations ?? 5000);

onMounted(async () => {
  try {
    const parsed = await session.parseImport(shamanSimc);
    if (!parsed.character) throw new Error('Import failed');
    await session.setCharacter(parsed.character, parsed.diagnostics);
    status.value = `Running baseline (${iterations} iterations)…`;
    await session.runSim({ iterations });
    status.value = `Running second sim (${iterations} iterations)…`;
    const entry = await session.runSim({ iterations });
    await navigateTo(`/runs/${entry.record.id.replace(/^#/, '')}`, { replace: true });
  } catch (e) {
    status.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <main class="page">
    <p class="num">{{ status }}</p>
    <UiProgressBar
      v-if="session.progress.value"
      label="Sim"
      :value="session.progress.value.fraction ?? undefined"
    />
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6);
}
</style>
