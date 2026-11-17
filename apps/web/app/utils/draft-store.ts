// The Workbench draft kept across reloads: the character being edited, its baseline (the character as at
// its last run), its lineage (utils/lineage.ts), the run it is compared against, and the import notes.
//
// Kept in localStorage under DRAFT_KEY as JSON `{ v: 1, character, baseline, lineageId, baseRunId,
// diagnostics }`: a few KB, read synchronously at start so the Workbench never flashes "No character". Every
// storage call is behind try/catch (private mode and blocked storage throw); without storage the draft
// lives for the tab only. Characters are parsed with CharacterSchema on read, so a draft saved before the
// schema gained a field gets that field's default; one that does not parse is dropped.
import { CharacterSchema, type Character, type Diagnostic } from '@fsim/contracts';

export const DRAFT_KEY = 'fsim-draft';
export const DRAFT_VERSION = 1;

export interface SavedDraft {
  character: Character;
  baseline: Character;
  lineageId: string;
  /** Run the draft is compared against ("Sim draft vs #0004"); null before its first run. */
  baseRunId: string | null;
  diagnostics: Diagnostic[];
}

export function encodeDraft(d: SavedDraft): string {
  return JSON.stringify({ v: DRAFT_VERSION, ...d });
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Read a stored draft. Never throws; null for nothing, another version or anything that does not parse. */
export function decodeDraft(text: string | null | undefined): SavedDraft | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data) || data.v !== DRAFT_VERSION) return null;
  const character = CharacterSchema.safeParse(data.character);
  if (!character.success) return null;
  const baseline = CharacterSchema.safeParse(data.baseline);
  if (typeof data.lineageId !== 'string' || !data.lineageId) return null;
  const diagnostics = Array.isArray(data.diagnostics)
    ? (data.diagnostics.filter(
        (d) => isObj(d) && typeof d.code === 'string' && typeof d.message === 'string',
      ) as unknown as Diagnostic[])
    : [];
  return {
    character: character.data,
    // A baseline that no longer parses: start the diff from the draft rather than lose the draft.
    baseline: baseline.success ? baseline.data : character.data,
    lineageId: data.lineageId,
    baseRunId: typeof data.baseRunId === 'string' && data.baseRunId ? data.baseRunId : null,
    diagnostics,
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(): SavedDraft | null {
  try {
    return decodeDraft(storage()?.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

/** Store the draft, or forget it with null. Best-effort: a full or blocked storage is logged and ignored. */
export function saveDraft(d: SavedDraft | null): void {
  try {
    const s = storage();
    if (!s) return;
    if (d) s.setItem(DRAFT_KEY, encodeDraft(d));
    else s.removeItem(DRAFT_KEY);
  } catch (e) {
    console.warn('draft: could not be saved; it is kept for this tab only.', e);
  }
}
