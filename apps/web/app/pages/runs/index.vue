<script setup lang="ts">
// /runs: the latest run, or an empty state when nothing has run yet.
const session = useSession();
// Stored runs load after the page does; follow the latest one as soon as it is there.
watch(
  session.latest,
  (latest) => {
    if (latest) void navigateTo(`/runs/${runSlug(latest.record.id)}`, { replace: true });
  },
  { immediate: true },
);
useHead({ title: 'Runs · forever/sim' });
</script>

<template>
  <main class="page">
    <UiEmptyState
      v-if="session.hydrated.value && !session.latest.value"
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
