// Saved Workbench variants as stored in IndexedDB (composables/history.ts, database "fsim-variants"), and
// reading them back. Pure, so the parts that can go wrong with old or odd data are unit-tested.
//
// A stored row is plain JSON. Its character is parsed with CharacterSchema on every load, so a variant
// saved before the schema gained a field gets that field's default; a row that still does not parse is
// reported as unreadable (and kept in storage) instead of breaking the list.
import { CharacterSchema, type Character } from '@fsim/contracts';

/** Row format version. Bump it only for a change `readVariantRow` cannot absorb on its own. */
export const VARIANT_ROW_VERSION = 1;

/** A draft kept for later: listed in the Workbench, picked on the Compare screen. */
export interface WorkbenchVariant {
  id: string;
  name: string;
  createdAt: string;
  /** Run the draft was edited from; null when it came straight from an import. */
  fromRunId: string | null;
  character: Character;
  /** Number of pending-change groups vs that run when saved. */
  changes: number;
  /** Linear estimate vs that run when saved; null without stat weights. */
  estimate: { delta: number; ci95: number } | null;
}

export interface VariantRow extends Omit<WorkbenchVariant, 'character'> {
  v: number;
  /** Plain JSON; parsed with CharacterSchema when read. */
  character: unknown;
}

/** A stored row that could not be read; shown so it can be deleted. */
export interface UnreadableVariant {
  id: string;
  name: string;
  reason: string;
}

export type ReadResult =
  { ok: true; variant: WorkbenchVariant } | { ok: false; unreadable: UnreadableVariant };

export const MAX_VARIANT_NAME = 60;

/** The row to store: JSON-safe (no proxies, no undefined), so IndexedDB's structured clone never throws. */
export function toVariantRow(v: WorkbenchVariant): VariantRow {
  return JSON.parse(JSON.stringify({ ...v, v: VARIANT_ROW_VERSION })) as VariantRow;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Read one stored row. Never throws. */
export function readVariantRow(raw: unknown): ReadResult {
  const row = isObj(raw) ? raw : {};
  const id = typeof row.id === 'string' && row.id ? row.id : '';
  const name = cleanVariantName(typeof row.name === 'string' ? row.name : '') || 'Unnamed variant';
  if (!id) return { ok: false, unreadable: { id, name, reason: 'no id' } };
  const parsed = CharacterSchema.safeParse(row.character);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    return {
      ok: false,
      unreadable: { id, name, reason: `${where}${issue?.message ?? 'invalid character'}` },
    };
  }
  const est = isObj(row.estimate) ? row.estimate : null;
  return {
    ok: true,
    variant: {
      id,
      name,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      fromRunId: typeof row.fromRunId === 'string' ? row.fromRunId : null,
      character: parsed.data,
      changes: finite(row.changes) ? row.changes : 0,
      estimate: est && finite(est.delta) && finite(est.ci95) ? { delta: est.delta, ci95: est.ci95 } : null,
    },
  };
}

/** Every stored row read, newest first; unreadable ones apart. */
export function readVariantRows(rows: readonly unknown[]): {
  variants: WorkbenchVariant[];
  unreadable: UnreadableVariant[];
} {
  const variants: WorkbenchVariant[] = [];
  const unreadable: UnreadableVariant[] = [];
  for (const r of rows) {
    const res = readVariantRow(r);
    if (res.ok) variants.push(res.variant);
    else unreadable.push(res.unreadable);
  }
  variants.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { variants, unreadable };
}

/** Trimmed, single-spaced, at most MAX_VARIANT_NAME characters. Empty when nothing is left. */
export const cleanVariantName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_VARIANT_NAME);

/** "Variant n" with the lowest n not already taken. */
export function nextVariantName(taken: readonly string[]): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`Variant ${n}`)) n++;
  return `Variant ${n}`;
}

/** A new variant id; unique across tabs. */
export function newVariantId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
