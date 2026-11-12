// Shared prop types for components/ui and components/charts.

export type Status = 'good' | 'warning' | 'info';
export type Quality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
/** Verdict of a difference: up/down only when it clears the noise floor, otherwise "noise". */
export type Verdict = 'up' | 'down' | 'noise' | 'reference';
export type RowState = 'selected' | 'changed' | 'warning' | 'reference';

export interface NavItem {
  label: string;
  to: string;
  /** Small mono count or detail after the label, e.g. "30/21/0". */
  detail?: string;
}

export interface KeyValue {
  label: string;
  value: string;
  /** Colors the value as a delta (blue/orange). Use with care: values are plain text otherwise. */
  tone?: 'up' | 'down';
}

export interface TableColumn<Row> {
  key: string;
  label: string;
  /** Screen-reader label when the visible label is a symbol (e.g. "±"). */
  srLabel?: string;
  align?: 'left' | 'right';
  /** Mono + tabular + right-aligned. */
  numeric?: boolean;
  /** Secondary text color ('2') or tertiary ('3'). */
  tone?: '2' | '3';
  width?: string;
  sortable?: boolean;
  /** Value used for sorting (defaults to row[key]). */
  sortValue?: (row: Row) => number | string;
}

export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface LegendItem {
  label: string;
  /** swatch: filled square · line: 2px line · dashed: dashed line · band: translucent block · dot · whisker · vline: dashed vertical */
  mark: 'swatch' | 'line' | 'dashed' | 'band' | 'dot' | 'whisker' | 'vline';
  /** Any CSS color, normally a token: 'var(--series-1)'. */
  color?: string;
}

export interface DiffRow {
  op: '-' | '+';
  label: string;
  detail?: string;
  detailTone?: 'up' | 'down' | 'muted';
}

export interface CheckItem {
  status: Status;
  text: string;
  /** Short mono code before the text, e.g. "HIT-01". */
  code?: string;
  /** Mono reference after the text, e.g. "line 11". */
  where?: string;
  action?: { label: string; to: string };
}

/** A line marker in UiCodeInput, keyed by 1-based line number. */
export interface LineMarker {
  status: 'good' | 'warning' | 'info';
  message?: string;
}

export interface ChartTableColumn {
  key: string;
  label: string;
  numeric?: boolean;
}
