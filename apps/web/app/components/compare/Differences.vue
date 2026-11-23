<script setup lang="ts">
// What differs: each variant against the baseline (A) as −/+ rows (gear slots, talents, spec options, buffs,
// fight, rotation, other settings), as the Workbench shows pending changes.
import type { CompareRow } from '~/composables/compare';
import { SLOT_LABELS } from '~/composables/workbench';
import { changeSummary } from '~/utils/character-diff';

const props = defineProps<{ rows: CompareRow[] }>();
const others = computed(() => props.rows.filter((r) => !r.baseline));
const base = computed(() => props.rows[0]);
</script>

<template>
  <div class="diffs">
    <section v-for="r in others" :key="r.id" class="variant" :aria-label="`${r.letter} ${r.name} vs A`">
      <h3 class="head">
        <span class="num letter">{{ r.letter }}</span> {{ r.name }}
        <span class="vs">vs A · {{ changeSummary(r.changes, (s) => SLOT_LABELS[s]) }}</span>
      </h3>
      <UiDiffRows v-if="r.changes.length" :groups="r.changes.map((g) => g.rows)" />
      <p v-else class="same">Same character as A ({{ base?.name }}): any Δ is noise.</p>
    </section>
  </div>
</template>

<style scoped>
.variant + .variant {
  border-top: 1px solid var(--line-row);
}
.head {
  margin: 0;
  padding: 10px var(--space-4) 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-1);
}
.letter {
  margin-right: 4px;
}
.vs {
  margin-left: 6px;
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.same {
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-3);
}
</style>
