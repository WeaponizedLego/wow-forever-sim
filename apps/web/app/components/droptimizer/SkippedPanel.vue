<script setup lang="ts">
// Drops from the chosen bosses that are not simmed, grouped by reason: each group a collapsible list of the items (in
// their quality colour). Short lists start open so the names show without a click.
import type { DropSkip } from '~/composables/droptimizer';

const props = defineProps<{ skipped: { itemId: number; reason: DropSkip }[] }>();
const names = useActionNames();

const groups = computed(() => {
  const by = new Map<DropSkip, number[]>();
  for (const s of props.skipped) by.set(s.reason, [...(by.get(s.reason) ?? []), s.itemId]);
  return [...by]
    .map(([reason, ids]) => ({
      reason,
      ids: ids.sort((a, b) => names.itemName(a).localeCompare(names.itemName(b))),
    }))
    .sort((a, b) => b.ids.length - a.ids.length);
});
/** Up to this many items in all, every group starts open. */
const OPEN_UP_TO = 12;
</script>

<template>
  <UiPanel title="Left out" :meta="`${skipped.length} item${skipped.length === 1 ? '' : 's'}`">
    <ul v-if="groups.length" class="groups">
      <li v-for="g in groups" :key="g.reason">
        <details :open="skipped.length <= OPEN_UP_TO">
          <summary>
            <span>{{ DROP_SKIP_LABELS[g.reason] }}</span>
            <span class="num text-2">{{ g.ids.length }}</span>
          </summary>
          <ul class="items" :aria-label="`Left out: ${DROP_SKIP_LABELS[g.reason]}`">
            <li v-for="id in g.ids" :key="id">
              <UiQualityName :quality="names.itemQuality(id)">{{ names.itemName(id) }}</UiQualityName>
            </li>
          </ul>
        </details>
      </li>
    </ul>
    <p v-else class="note">Every drop from these bosses is a candidate.</p>
  </UiPanel>
</template>

<style scoped>
.groups {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--text-sm);
}
summary {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  cursor: pointer;
  color: var(--text-1);
}
summary > span:first-child::before {
  content: '▸ ';
  color: var(--text-3);
}
details[open] summary > span:first-child::before {
  content: '▾ ';
}
summary::-webkit-details-marker {
  display: none;
}
.items {
  list-style: none;
  margin: 4px 0 6px;
  padding: 0 0 0 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.text-2 {
  color: var(--text-2);
}
.note {
  margin: 0;
  padding: 10px var(--space-4) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
