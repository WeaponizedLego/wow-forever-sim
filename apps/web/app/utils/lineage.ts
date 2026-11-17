// Character lineages: which runs may be compared with which.
//
// Every character the session holds belongs to a lineage. Pasting an import, picking a spec preset or
// opening a share link starts a new one; editing the draft, loading a saved variant of it or opening one
// of its runs in the Workbench keeps it. A run records the lineage of the character it simmed
// (`RunRecord.lineageId`), and a baseline or "Δ vs" comparison is only ever between runs of one lineage.
//
// Records made before lineages existed have no `lineageId`; each counts as its own lineage, so the stale
// cross-character baselines they may name are never shown. Pure, so the rules are unit-tested.
import type { RunRecord } from '@fsim/contracts';

type Rec = Pick<RunRecord, 'id' | 'lineageId'>;

/** A new lineage id; unique across tabs. */
export function newLineageId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `l${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** The lineage of a run; an older record without one is a lineage of its own. */
export const lineageOf = (r: Rec): string => r.lineageId ?? `run:${r.id}`;

export const sameLineage = (a: Rec, b: Rec): boolean => lineageOf(a) === lineageOf(b);

/**
 * The run `record` is compared against: its `baselineId`, looked up with `find`, when that run exists and
 * is of the same lineage. Null otherwise.
 */
export function comparableBaseline<T extends { record: Rec }>(
  record: Rec & Pick<RunRecord, 'baselineId'>,
  find: (id: string) => T | null | undefined,
): T | null {
  if (!record.baselineId || record.baselineId === record.id) return null;
  const base = find(record.baselineId);
  return base && sameLineage(record, base.record) ? base : null;
}

/** The newest run of a lineage (runs newest first), or null. */
export function latestOfLineage<T extends { record: Rec }>(runs: readonly T[], lineage: string): T | null {
  return runs.find((r) => lineageOf(r.record) === lineage) ?? null;
}

/**
 * Lineage and baseline for a new run. A draft run keeps the draft's lineage and is compared against the run
 * the draft came from, if that run is still there. Simming some other character (re-running an old run)
 * takes the lineage given with it, or starts a new one, and is compared against the given baseline.
 */
export function runLineage(
  given: { lineageId: string; baselineId: string | null } | null,
  exists: (id: string) => boolean,
): { lineageId: string; baselineId?: string } {
  const lineageId = given?.lineageId ?? newLineageId();
  const baselineId = given?.baselineId && exists(given.baselineId) ? given.baselineId : undefined;
  return { lineageId, ...(baselineId && { baselineId }) };
}
