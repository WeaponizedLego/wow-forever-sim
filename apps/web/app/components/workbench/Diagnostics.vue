<script setup lang="ts">
// Import findings, once and compactly: warnings on one line each, info notes folded away.
const session = useSession();

const warnings = computed(() =>
  session.importDiagnostics.value.filter((d) => d.severity !== 'info' && d.code !== 'DATA-03'),
);
const dataMissing = computed(() => session.importDiagnostics.value.filter((d) => d.code === 'DATA-03'));
const infos = computed(() => session.importDiagnostics.value.filter((d) => d.severity === 'info'));
</script>

<template>
  <section
    v-if="warnings.length || dataMissing.length || infos.length"
    class="diag"
    aria-label="Import notes"
  >
    <ul class="diag__list">
      <li v-for="(d, i) in warnings" :key="`${d.code}-${i}`" class="diag__row">
        <UiStatusGlyph status="warning" hide-label :label="d.severity" />
        <span class="num diag__code">{{ d.code }}</span>
        <span class="diag__msg">{{ d.message }}</span>
      </li>
      <li v-if="dataMissing.length" class="diag__row">
        <UiStatusGlyph status="warning" hide-label />
        <span class="num diag__code">DATA-03</span>
        <span class="diag__msg"
          >{{ dataMissing.length }} {{ dataMissing.length === 1 ? 'id is' : 'ids are' }} not in this data
          build; marked in the gear table.</span
        >
      </li>
    </ul>
    <details v-if="infos.length" class="diag__more">
      <summary class="num">{{ infos.length }} import notes</summary>
      <ul class="diag__list">
        <li v-for="(d, i) in infos" :key="`${d.code}-${i}`" class="diag__row">
          <UiStatusGlyph status="info" hide-label />
          <span class="num diag__code">{{ d.code }}</span>
          <span class="diag__msg">{{ d.message }}</span>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.diag {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line-seam);
  border-left: 2px solid var(--status-warning);
  background: var(--status-warning-bg);
  font-size: var(--text-sm);
}
.diag__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.diag__row {
  display: grid;
  grid-template-columns: 14px 76px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: baseline;
  padding: 2px 0;
}
.diag__row :deep(.glyph) {
  transform: translateY(2px);
}
.diag__code {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.diag__msg {
  color: var(--text-2);
}
.diag__more summary {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-3);
  cursor: pointer;
}
@media (max-width: 640px) {
  .diag__row {
    grid-template-columns: 14px minmax(0, 1fr);
  }
  .diag__code {
    display: none;
  }
}
</style>
