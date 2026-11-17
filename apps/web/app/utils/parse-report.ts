// The Start screen's parse report as check-list items: warnings first, then notes, each with a badge that matches
// what it says. Lines the importer read and set aside because the engine has no use for them (bags, the shirt,
// content_tuning on an item: "… skipped; the engine does not use it.") are fine, not news, so they leave the main
// list and come back as one collapsible "N lines not used by the sim", marked OK like their line in the editor.
import type { Diagnostic } from '@fsim/contracts';
import type { CheckItem, Status } from '~/composables/ui-types';

/** A note that only says the export had something the engine does not use. */
export const isUnusedNote = (d: Diagnostic): boolean =>
  d.severity === 'info' && d.code === 'PARSE-02' && /the engine does not use it\.?$/.test(d.message);

export interface ParseReport {
  /** Warnings, then notes worth reading; one OK line when there are none. */
  items: CheckItem[];
  /** The set-aside lines, OK-badged. */
  unused: CheckItem[];
}

const RANK: Record<Status, number> = { warning: 0, info: 1, good: 2 };

const item = (d: Diagnostic, status: Status): CheckItem => ({
  status,
  code: d.code,
  text: d.message,
  where: d.line ? `line ${d.line}` : '—',
});

export function parseReport(diagnostics: readonly Diagnostic[]): ParseReport {
  const unused = diagnostics.filter(isUnusedNote).map((d) => item(d, 'good'));
  const items = diagnostics
    .filter((d) => !isUnusedNote(d))
    .map((d) => item(d, d.severity === 'info' ? 'info' : 'warning'))
    // Stable: warnings first, each group in the export's order.
    .sort((a, b) => RANK[a.status] - RANK[b.status]);
  if (!items.length)
    items.push({
      status: 'good',
      text: unused.length ? 'Everything the sim uses was read.' : 'Everything in the export was read.',
    });
  return { items, unused };
}

/** "9 lines not used by the sim". */
export const unusedSummary = (n: number): string => `${n} line${n === 1 ? '' : 's'} not used by the sim`;
