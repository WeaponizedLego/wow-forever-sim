<script setup lang="ts">
// /runs: the latest run, or an empty state when nothing has run yet.
const session = useSession();
const latest = session.latest.value;
if (latest) await navigateTo(`/runs/${runSlug(latest.record.id)}`, { replace: true });
useHead({ title: 'Runs · forever/sim' });
</script>

<template>
  <main class="page">
    <UiEmptyState
      title="No runs yet"
      body="Import a character or pick a spec, then run a sim to analyse it here."
    >
      <UiButton variant="primary" to="/">New run</UiButton>
    </UiEmptyState>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) 40px;
}
</style>
