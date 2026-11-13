import type { Diagnostic, ImportContext, ImportFormat, ImportResult, Importer } from '@fsim/contracts';
import { simcImporter } from './simc';
import { wowheadImporter } from './wowhead';
import { wowsimsImporter } from './wowsims';

/** In detection order: a Wowhead link can sit inside other text, and JSON is checked before SimC. */
export const IMPORTERS: readonly Importer[] = [wowheadImporter, wowsimsImporter, simcImporter];

/** Which format the pasted text looks like, or null. Cheap; never throws. */
export function detectFormat(input: string): ImportFormat | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  try {
    return IMPORTERS.find((i) => i.detect(input))?.format ?? null;
  } catch {
    return null;
  }
}

/** Detects the format and parses with the matching importer. Never throws. */
export function importAny(input: string, ctx: ImportContext): ImportResult {
  const format = detectFormat(input);
  const importer = IMPORTERS.find((i) => i.format === format);
  if (!importer) {
    const empty = typeof input !== 'string' || input.trim() === '';
    const diagnostic: Diagnostic = {
      code: 'FMT-01',
      severity: 'error',
      message: `${empty ? 'Nothing to import' : 'Format not recognised'}. Paste a SimC export, a WoWSims addon export or a Wowhead gear planner link.`,
    };
    return { format: null, character: null, diagnostics: [diagnostic] };
  }
  try {
    return importer.parse(input, ctx);
  } catch (e) {
    return {
      format,
      character: null,
      diagnostics: [{ code: 'FMT-01', severity: 'error', message: `Import failed: ${String(e)}` }],
    };
  }
}
