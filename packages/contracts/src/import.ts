import type { Character } from './character';

export type ImportFormat = 'simc' | 'wowsims-json' | 'wowhead-url';

export type Severity = 'error' | 'warning' | 'info';

/**
 * One finding from an importer. Codes are stable and shown in the UI (e.g. "DATA-03"),
 * so tests and run notes can refer to them.
 */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  /** 1-based line in the pasted input, when the finding belongs to a line. */
  line?: number;
  /** Gear slot or field the finding concerns, e.g. "shoulder". */
  field?: string;
}

export type DiagnosticCode =
  /** Input format not recognised. */
  | 'FMT-01'
  /** Line could not be parsed and was skipped. */
  | 'PARSE-02'
  /** Item, enchant or suffix id not in the current data build. */
  | 'DATA-03'
  /** Class, spec or race not supported by the engine. */
  | 'SPEC-04'
  /** Value filled from the spec preset because the export did not include it. */
  | 'DEFAULT-05';

export interface ImportResult {
  format: ImportFormat | null;
  /** Null only when the input could not be read at all (an error diagnostic says why). */
  character: Character | null;
  diagnostics: Diagnostic[];
}

/** Every importer has this shape. `detect` must be cheap; `parse` must never throw on bad input. */
export interface Importer {
  format: ImportFormat;
  detect(input: string): boolean;
  parse(input: string, ctx: ImportContext): ImportResult;
}

/** What importers may ask about the game data, so they can flag ids the data build lacks. */
export interface ImportContext {
  hasItem(itemId: number): boolean;
  hasEnchant(enchantId: number): boolean;
  dataBuild: string;
}
