<script setup lang="ts" generic="Row extends object">
import type { RowState, TableColumn, TableSort } from '~/composables/ui-types';

// Dense data table. Numeric columns are mono and right-aligned. Sortable headers are buttons
// (aria-sort on the th). Row states paint the row and an inset 2px marker on the first cell.
// The table sits in its own horizontal scroll box (never the page); a shadow at an edge says there is more
// to scroll to. With `maxHeight` it also scrolls vertically and the header sticks.
// With `stack`, a panel narrower than 560px shows each row as a stacked card instead: one line per cell,
// its column label on the left (columns with `stackLabel: false` are full-width title lines).
// Cells: #cell-<key>="{ row, value }", headers: #head-<key>="{ column }".
// With `rowTo`, clicking anywhere on a row opens its page; keep a real link in one cell for keyboard users.
const props = withDefaults(
  defineProps<{
    columns: TableColumn<Row>[];
    rows: Row[];
    rowKey: (row: Row, index: number) => string | number;
    rowState?: (row: Row) => RowState | undefined;
    caption?: string;
    hideHeader?: boolean;
    /** Below this width the table scrolls sideways instead of squeezing. */
    minWidth?: string;
    maxHeight?: string;
    /** Row padding: 'md' 7px (default), 'sm' 5px, 'lg' 8px. */
    density?: 'sm' | 'md' | 'lg';
    /** Where a click on the row goes. */
    rowTo?: (row: Row) => string | undefined;
    /** Stacked cards instead of sideways scrolling in a narrow panel. */
    stack?: boolean;
  }>(),
  {
    rowState: undefined,
    caption: undefined,
    hideHeader: false,
    minWidth: undefined,
    maxHeight: undefined,
    density: 'md',
    rowTo: undefined,
    stack: false,
  },
);

function onRowClick(row: Row, e: MouseEvent) {
  const to = props.rowTo?.(row);
  if (!to) return;
  // Links, buttons and fields in the row do their own thing; a drag that selected text is not a click.
  if ((e.target as Element | null)?.closest('a, button, input, select, textarea, summary, label')) return;
  if (window.getSelection()?.toString()) return;
  void navigateTo(to);
}
const sort = defineModel<TableSort | null>('sort', { default: null });

function cellValue(row: Row, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

const sorted = computed(() => {
  const s = sort.value;
  const col = s && props.columns.find((c) => c.key === s.key);
  if (!s || !col) return props.rows;
  const get = col.sortValue ?? ((r: Row) => cellValue(r, col.key) as number | string);
  const dir = s.dir === 'asc' ? 1 : -1;
  return [...props.rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y)) * dir;
  });
});

function toggle(col: TableColumn<Row>) {
  if (sort.value?.key === col.key) {
    sort.value = { key: col.key, dir: sort.value.dir === 'desc' ? 'asc' : 'desc' };
  } else {
    // Numbers start high-to-low; text A–Z.
    sort.value = { key: col.key, dir: col.numeric ? 'desc' : 'asc' };
  }
}
function ariaSort(col: TableColumn<Row>) {
  if (!col.sortable) return undefined;
  if (sort.value?.key !== col.key) return 'none';
  return sort.value.dir === 'asc' ? 'ascending' : 'descending';
}
function alignOf(col: TableColumn<Row>) {
  return col.align ?? (col.numeric ? 'right' : 'left');
}
</script>

<template>
  <div
    class="scroll"
    :class="{ 'scroll--stack': stack }"
    :style="{ maxHeight }"
    :tabindex="minWidth || maxHeight ? 0 : undefined"
    :aria-label="caption"
  >
    <!-- Explicit roles keep the table a table for screen readers while stacked (display: block). -->
    <table
      class="table"
      :class="[`table--${density}`, { 'table--stack': stack }]"
      :style="{ minWidth }"
      :role="stack ? 'table' : undefined"
    >
      <caption v-if="caption" class="visually-hidden">
        {{
          caption
        }}
      </caption>
      <colgroup>
        <col v-for="col in columns" :key="col.key" :style="{ width: col.width }" />
      </colgroup>
      <thead :class="{ 'visually-hidden': hideHeader }" :role="stack ? 'rowgroup' : undefined">
        <tr :role="stack ? 'row' : undefined">
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            :role="stack ? 'columnheader' : undefined"
            class="label th"
            :class="`al-${alignOf(col)}`"
            :aria-sort="ariaSort(col)"
          >
            <slot :name="`head-${col.key}`" :column="col">
              <button v-if="col.sortable" type="button" class="sort" @click="toggle(col)">
                <span :aria-hidden="col.srLabel ? 'true' : undefined">{{ col.label }}</span>
                <span v-if="col.srLabel" class="visually-hidden">{{ col.srLabel }}</span>
                <span class="sort__glyph" aria-hidden="true">{{
                  sort?.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
              <template v-else>
                <span :aria-hidden="col.srLabel ? 'true' : undefined">{{ col.label }}</span>
                <span v-if="col.srLabel" class="visually-hidden">{{ col.srLabel }}</span>
              </template>
            </slot>
          </th>
        </tr>
      </thead>
      <tbody :role="stack ? 'rowgroup' : undefined">
        <tr
          v-for="(row, i) in sorted"
          :key="rowKey(row, i)"
          :class="[rowState?.(row) && `is-${rowState(row)}`, { 'is-link': !!rowTo }]"
          :role="stack ? 'row' : undefined"
          @click="onRowClick(row, $event)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            :class="[
              `al-${alignOf(col)}`,
              { num: col.numeric, 'is-title': col.stackLabel === false },
              col.tone && `tone-${col.tone}`,
            ]"
            :role="stack ? 'cell' : undefined"
            :data-label="stack && col.stackLabel !== false ? (col.srLabel ?? col.label) : undefined"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="cellValue(row, col.key)">{{
              cellValue(row, col.key)
            }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.scroll {
  /* Contains the absolutely positioned visually-hidden labels, which otherwise widen the page on phones. */
  position: relative;
  overflow: auto;
  /* Scroll shadows: an edge with more table past it shows a soft shade. The panel-coloured covers scroll with
     the content (local) and hide the shades (scroll) at whichever end is reached. */
  background:
    linear-gradient(to right, var(--bg-panel) 40%, transparent) left / 32px 100% no-repeat local,
    linear-gradient(to left, var(--bg-panel) 40%, transparent) right / 32px 100% no-repeat local,
    linear-gradient(to right, rgb(236 237 238 / 12%), transparent) left / 12px 100% no-repeat scroll,
    linear-gradient(to left, rgb(236 237 238 / 12%), transparent) right / 12px 100% no-repeat scroll;
}
.scroll--stack {
  container-type: inline-size;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--space-2);
  background: var(--bg-panel);
  border-bottom: 1px solid var(--line-seam);
  font-weight: 400;
  white-space: nowrap;
}
td {
  padding: 7px var(--space-2);
  border-bottom: 1px solid var(--line-row);
  vertical-align: middle;
}
.table--sm td {
  padding-block: 5px;
}
.table--lg td {
  padding-block: var(--space-2);
}
th:first-child,
td:first-child {
  padding-left: var(--space-4);
}
th:last-child,
td:last-child {
  padding-right: var(--space-4);
}
.al-left {
  text-align: left;
}
.al-right {
  text-align: right;
}
.tone-2 {
  color: var(--text-2);
}
.tone-3 {
  color: var(--text-3);
}
.sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}
.al-right .sort {
  flex-direction: row-reverse;
}
.sort:hover,
[aria-sort='ascending'] .sort,
[aria-sort='descending'] .sort {
  color: var(--text-1);
}
.sort__glyph {
  display: inline-block;
  width: 0.75em;
  font-size: 0.75em;
}
tr.is-link {
  cursor: pointer;
}
tr.is-link:hover {
  background: var(--chart-hover);
}
tr.is-changed {
  background: var(--bg-row-changed);
}
tr.is-warning {
  background: var(--status-warning-bg);
}
tr.is-reference {
  background: var(--bg-row-reference);
}
tr.is-selected {
  background: var(--bg-raised);
}
tr.is-changed > td:first-child {
  box-shadow: inset 2px 0 0 var(--series-1);
}
tr.is-warning > td:first-child {
  box-shadow: inset 2px 0 0 var(--status-warning);
}
tr.is-selected > td:first-child {
  box-shadow: inset 2px 0 0 var(--text-1);
}

/* Stacked cards in a narrow panel (`stack`). */
@container (max-width: 560px) {
  .table--stack {
    /* Beats the inline min-width that makes the wide layout scroll. */
    min-width: 0 !important;
  }
  .table--stack colgroup {
    display: none;
  }
  .table--stack thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .table--stack,
  .table--stack tbody,
  .table--stack tr {
    display: block;
  }
  .table--stack tr {
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--line-row);
  }
  .table--stack td,
  .table--stack td:first-child,
  .table--stack td:last-child {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 1px 0;
    border: 0;
    text-align: right;
  }
  .table--stack td::before {
    content: attr(data-label);
    flex-shrink: 0;
    color: var(--text-3);
    text-align: left;
  }
  .table--stack td.is-title {
    display: block;
    text-align: left;
  }
  .table--stack td.is-title::before {
    content: none;
  }
  /* Cell contents (bars, chips) take the rest of the line. */
  .table--stack td > :deep(*) {
    min-width: 0;
  }
  .table--stack td > :deep(.ib) {
    flex: 1 1 auto;
    max-width: 70%;
  }
  /* The row-state marker moves from the first cell to the card. */
  .table--stack tr > td:first-child {
    box-shadow: none;
  }
  .table--stack tr.is-changed {
    box-shadow: inset 2px 0 0 var(--series-1);
  }
  .table--stack tr.is-warning {
    box-shadow: inset 2px 0 0 var(--status-warning);
  }
  .table--stack tr.is-selected {
    box-shadow: inset 2px 0 0 var(--text-1);
  }
}
</style>
