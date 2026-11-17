// Share links: a character plus the sim settings needed to reproduce a run, packed into the URL fragment
// (`/s#<payload>`). The fragment never leaves the browser, so nothing is sent to a server.
//
// Format, version 1: JSON `{ v: 1, character, iterations, seed, engineId, kind }` → deflate-raw
// (CompressionStream) → base64url without padding. A future format bumps `v`; decoding an unknown `v`
// fails with a message rather than guessing. Pure and browser/Node-agnostic so vitest can cover it.
import { CharacterSchema, type Character } from '@fsim/contracts';

export const SHARE_VERSION = 1;

/** What a link is for. `draft` is an unsimmed Workbench character; the others name the kind of run it came from. */
export const SHARE_KINDS = ['single', 'stat-weights', 'top-gear', 'draft'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export interface SharePayload {
  v: typeof SHARE_VERSION;
  character: Character;
  iterations: number;
  seed: number;
  /** Engine the link was made with (`EngineVersion.engineId`). */
  engineId: string;
  kind: ShareKind;
}

export class ShareLinkError extends Error {
  override name = 'ShareLinkError';
}

/** Longest fragment we try to decode; real links are a few hundred characters. Guards against inflating junk. */
const MAX_ENCODED = 64 * 1024;
const MAX_JSON = 512 * 1024;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text))
    throw new ShareLinkError('The link contains characters a share link never has.');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ShareLinkError('The link is cut off or garbled.');
  }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

type Checked = { ok: true; payload: SharePayload } | { ok: false; reason: string };

/** Check a decoded object field by field; returns the payload (character parsed with defaults) or a reason. */
export function validateShare(data: unknown): Checked {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { ok: false, reason: 'not an object' };
  const d = data as Record<string, unknown>;
  if (d.v !== SHARE_VERSION) return { ok: false, reason: `v: expected ${SHARE_VERSION}` };
  const int = (x: unknown, min: number, max: number): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
  if (!int(d.iterations, 1, 1_000_000)) return { ok: false, reason: 'iterations: expected 1 to 1,000,000' };
  if (!int(d.seed, 0, Number.MAX_SAFE_INTEGER))
    return { ok: false, reason: 'seed: expected a whole number ≥ 0' };
  if (typeof d.engineId !== 'string' || !/^[\w.-]{1,64}$/.test(d.engineId))
    return { ok: false, reason: 'engineId: expected an engine id' };
  if (!(SHARE_KINDS as readonly unknown[]).includes(d.kind)) return { ok: false, reason: 'kind: unknown' };
  const c = CharacterSchema.safeParse(d.character);
  if (!c.success) {
    const issue = c.error.issues[0];
    const at = issue?.path.length ? `.${issue.path.join('.')}` : '';
    return { ok: false, reason: `character${at}: ${issue?.message ?? 'invalid'}` };
  }
  return {
    ok: true,
    payload: {
      v: SHARE_VERSION,
      character: c.data,
      iterations: d.iterations,
      seed: d.seed,
      engineId: d.engineId,
      kind: d.kind as ShareKind,
    },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Drop fields that equal CharacterSchema's defaults; decoding parses with the schema, which puts them back.
 * Keeps links short without changing what they mean.
 */
export function compactCharacter(c: Character): Record<string, unknown> {
  const defaults = CharacterSchema.parse({ ...c, ...EMPTY_DEFAULTED });
  const out: Record<string, unknown> = { ...c };
  for (const key of Object.keys(EMPTY_DEFAULTED) as (keyof typeof EMPTY_DEFAULTED)[]) {
    if (same(c[key], defaults[key])) delete out[key];
  }
  if (out.encounter) {
    const enc: Record<string, unknown> = { ...c.encounter };
    for (const k of Object.keys(enc) as (keyof Character['encounter'])[])
      if (same(enc[k], defaults.encounter[k])) delete enc[k];
    out.encounter = enc;
  }
  return out;
}
/** Every CharacterSchema field with a default, unset. */
const EMPTY_DEFAULTED = {
  level: undefined,
  professions: undefined,
  consumables: undefined,
  specOptions: undefined,
  playerOptions: undefined,
  buffs: undefined,
  encounter: undefined,
};

/** Encode a payload as the fragment text (without the `#`). Validates first, so a link always decodes. */
export async function encodeShare(payload: Omit<SharePayload, 'v'>): Promise<string> {
  const checked = validateShare({ v: SHARE_VERSION, ...payload });
  if (!checked.ok) throw new ShareLinkError(`Cannot share this: ${checked.reason}.`);
  const compact = { ...checked.payload, character: compactCharacter(checked.payload.character) };
  const json = new TextEncoder().encode(JSON.stringify(compact));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Decode fragment text (with or without the leading `#`). Throws ShareLinkError with a readable message. */
export async function decodeShare(fragment: string): Promise<SharePayload> {
  const text = fragment.replace(/^#/, '').trim();
  if (!text) throw new ShareLinkError('The link has no character in it.');
  if (text.length > MAX_ENCODED) throw new ShareLinkError('The link is too long to be a share link.');
  let json: string;
  try {
    const raw = await pipe(fromBase64Url(text), new DecompressionStream('deflate-raw'));
    if (raw.length > MAX_JSON) throw new ShareLinkError('The link is too long to be a share link.');
    json = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (e) {
    if (e instanceof ShareLinkError) throw e;
    throw new ShareLinkError('The link is cut off or garbled.');
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ShareLinkError('The link is cut off or garbled.');
  }
  const v = (data as { v?: unknown } | null)?.v;
  if (typeof v !== 'number') throw new ShareLinkError('The link has no format version.');
  if (v > SHARE_VERSION)
    throw new ShareLinkError(`The link uses a newer format (v${v}) than this version of the app reads.`);
  const checked = validateShare(data);
  if (!checked.ok) throw new ShareLinkError(`The link's contents are not valid (${checked.reason}).`);
  return checked.payload;
}
