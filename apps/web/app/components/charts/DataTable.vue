<script setup lang="ts">
import type { ChartTableColumn } from '~/composables/ui-types';

// The table behind a chart. Hidden visually (but read by screen readers) unless `visible`, e.g.
// when the panel's Chart/Table switch is on Table.
withDefaults(
  defineProps<{
    caption: string;
    columns: ChartTableColumn[];
    rows: Record<string, string | number>[];
    visible?: boolean;
    maxHeight?: string;
  }>(),
  { visible: false, maxHeight: '320px' },
);
</script>

<template>
  <div
    :class="visible ? 'ctable' : 'visually-hidden'"
    :style="visible ? { maxHeight } : undefined"
    :tabindex="visible ? 0 : undefined"
  >
    <table>
      <caption :class="{ 'visually-hidden': visible }">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key" scope="col" class="label" :class="{ r: c.numeric }">
            {{ c.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="c in columns" :key="c.key" :class="{ 'num r': c.numeric }">{{ row[c.key] }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ctable {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
th {
  position: sticky;
  top: 0;
  background: var(--bg-panel);
  font-weight: 400;
  text-align: left;
  padding: 6px var(--space-2);
  border-bottom: 1px solid var(--line-seam);
}
td {
  padding: 5px var(--space-2);
  border-bottom: 1px solid var(--line-row);
}
th:first-child,
td:first-child {
  padding-left: var(--space-4);
}
th:last-child,
td:last-child {
  padding-right: var(--space-4);
}
.r {
  text-align: right;
}
</style>
