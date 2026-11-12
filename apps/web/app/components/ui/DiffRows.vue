<script setup lang="ts">
import type { DiffRow } from '~/composables/ui-types';

// −/+ rows like a code diff (Workbench "Pending changes"). Each group is one change: what goes out,
// what comes in. `detail` sits right-aligned: a slot name, or the estimated gain in delta color.
defineProps<{ groups: DiffRow[][] }>();
</script>

<template>
  <div class="num diff">
    <ul v-for="(group, gi) in groups" :key="gi" class="diff__group">
      <li
        v-for="(row, ri) in group"
        :key="ri"
        class="diff__row"
        :class="row.op === '-' ? 'is-del' : 'is-add'"
      >
        <span class="diff__op" aria-hidden="true">{{ row.op === '-' ? '−' : '+' }}</span>
        <span class="diff__label"
          ><span class="visually-hidden">{{ row.op === '-' ? 'Remove' : 'Add' }}:</span> {{ row.label }}</span
        >
        <span v-if="row.detail" class="diff__detail" :class="`tone-${row.detailTone ?? 'muted'}`">{{
          row.detail
        }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.diff {
  font-size: var(--text-sm);
  padding: var(--space-2) 0;
}
.diff__group {
  list-style: none;
  margin: 0;
  padding: 0;
}
.diff__group + .diff__group {
  margin-top: 6px;
}
.diff__row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 6px;
  padding: var(--space-1) var(--space-4);
}
.is-del {
  background: var(--delta-down-bg);
}
.is-add {
  background: var(--delta-up-bg);
}
.is-del .diff__op {
  color: var(--delta-down);
}
.is-add .diff__op {
  color: var(--delta-up);
}
.diff__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tone-up {
  color: var(--delta-up);
}
.tone-down {
  color: var(--delta-down);
}
.tone-muted {
  color: var(--text-3);
}
</style>
