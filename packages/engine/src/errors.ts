// Engine error messages for people. The engine recovers its Go panics and reports them as
// `<panic value>\nStack Trace:\n<goroutine dump>`; screens show `message` and keep `detail` (the raw text)
// behind a disclosure. Pure, so it is unit-tested without the WASM.

/** Slot names in the engine's `ItemSlot` order (the order of `EquipmentSpec.items`). */
export const ENGINE_SLOT_NAMES = [
  'Head',
  'Neck',
  'Shoulder',
  'Back',
  'Chest',
  'Wrist',
  'Hands',
  'Waist',
  'Legs',
  'Feet',
  'Ring 1',
  'Ring 2',
  'Trinket 1',
  'Trinket 2',
  'Main hand',
  'Off hand',
  'Ranged',
] as const;

export type MissingKind = 'item' | 'enchant' | 'gem';

export interface EngineErrorInfo {
  /** One readable line. */
  message: string;
  /** The raw engine text (panic value and stack trace), when there is more to it than `message`. */
  detail: string | null;
  /** Set for the engine's "No item with id: N" family of panics. */
  missing?: { kind: MissingKind; id: number; slot?: string };
}

/** What the mapper needs from a request to name a slot: its players' equipment. */
export interface ErrorRequestContext {
  raid?: {
    parties: readonly {
      players: readonly {
        equipment?: { items: readonly { id: number; enchant: number; gems?: readonly number[] }[] };
      }[];
    }[];
  };
}

const TRACE = /\s*(?:Stack Trace:|goroutine \d+ \[)/;
const MISSING = /No (item|enchant|gem) with id:?\s*(\d+)/i;
const MAX_MESSAGE = 300;

function findSlot(kind: MissingKind, id: number, ctx: ErrorRequestContext | undefined): string | undefined {
  for (const party of ctx?.raid?.parties ?? [])
    for (const player of party.players) {
      const items = player.equipment?.items ?? [];
      const i = items.findIndex((it) =>
        kind === 'item' ? it.id === id : kind === 'enchant' ? it.enchant === id : !!it.gems?.includes(id),
      );
      if (i >= 0) return ENGINE_SLOT_NAMES[i] ?? `slot ${i}`;
    }
  return undefined;
}

/**
 * A readable message for an engine error text. Safe to call on text that is already readable: a single
 * line comes back unchanged. Text of the form "readable line\nraw" (see `engineErrorText`) keeps its first
 * line as the message and the rest as detail.
 */
export function describeEngineError(raw: string, ctx?: ErrorRequestContext): EngineErrorInfo {
  const text = raw.trim();
  // The message: the first line, or less when the stack trace starts on it.
  let end = text.indexOf('\n');
  if (end < 0) end = text.length;
  const trace = TRACE.exec(text);
  if (trace && trace.index < end) end = trace.index;
  const head = text.slice(0, end).trim();
  const detail = text.slice(end).trim() || null;

  const m = MISSING.exec(head);
  if (m) {
    const kind = m[1]!.toLowerCase() as MissingKind;
    const id = Number(m[2]);
    const slot = findSlot(kind, id, ctx);
    const where = slot ? ` (${slot})` : '';
    return {
      message: `This engine's game data has no ${kind} ${id}${where}, so the sim could not run. The ${kind} may be newer than the engine build: replace it in the Workbench and sim again.`,
      detail: text,
      missing: { kind, id, ...(slot && { slot }) },
    };
  }
  const message = head.length > MAX_MESSAGE ? `${head.slice(0, MAX_MESSAGE - 1)}…` : head;
  return {
    message: message || 'The engine reported an error.',
    detail: message !== head ? text : detail,
  };
}

/**
 * An error as one string for screens that keep errors as text: the readable message on the first line,
 * the raw engine text (if any) after it. `describeEngineError` splits it back apart for display.
 */
export function engineErrorText(e: unknown): string {
  if (e instanceof Error) {
    const detail = (e as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail) return `${e.message}\n${detail}`;
    return e.message;
  }
  return String(e);
}
