import { describe, expect, it } from 'vitest';
import { CharacterSchema } from '@fsim/contracts';
import {
  SHARE_VERSION,
  ShareLinkError,
  decodeShare,
  encodeShare,
  fromBase64Url,
  toBase64Url,
  type SharePayload,
} from './share-codec';

const character = CharacterSchema.parse({
  name: 'Thrallson',
  class: 'shaman',
  spec: 'enhancement-shaman',
  race: 'orc',
  level: 42,
  gear: {
    head: { itemId: 10504 },
    mainHand: { itemId: 12784, enchantId: 1900 },
    finger1: { itemId: 10776, randomSuffix: 1205 },
  },
  talents: '25003105-5052032501-05',
  consumables: { flaskId: 13512, foodId: 21023 },
  specOptions: { shield: 1, imbueMh: 2 },
  rotation: { kind: 'preset', presetId: 'default' },
  encounter: { durationSec: 120 },
});
const payload: Omit<SharePayload, 'v'> = {
  character,
  iterations: 5000,
  seed: 1_234_567_890,
  engineId: '80ef867',
  kind: 'single',
};

async function rawFragment(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')));
  return toBase64Url(new Uint8Array(await out.arrayBuffer()));
}

describe('share codec', () => {
  it('round-trips a payload unchanged', async () => {
    const text = await encodeShare(payload);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(text);
    expect(back).toEqual({ v: SHARE_VERSION, ...payload });
  });

  it('accepts the fragment with its leading #', async () => {
    const text = await encodeShare(payload);
    expect((await decodeShare(`#${text}`)).seed).toBe(payload.seed);
  });

  it('round-trips a draft and a seed of 0', async () => {
    const back = await decodeShare(await encodeShare({ ...payload, kind: 'draft', seed: 0 }));
    expect(back.kind).toBe('draft');
    expect(back.seed).toBe(0);
  });

  it('keeps links short', async () => {
    expect((await encodeShare(payload)).length).toBeLessThan(500);
  });

  it('base64url round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64Url(toBase64Url(all))).toEqual(all);
  });

  it('refuses to encode an invalid payload', async () => {
    await expect(encodeShare({ ...payload, iterations: 0 })).rejects.toBeInstanceOf(ShareLinkError);
  });

  it('rejects a newer format version with a clear message', async () => {
    const text = await rawFragment({ ...payload, v: SHARE_VERSION + 1 });
    await expect(decodeShare(text)).rejects.toThrow(/newer format/);
  });

  it('rejects a payload without a version', async () => {
    await expect(decodeShare(await rawFragment(payload))).rejects.toThrow(/no format version/);
  });

  it('rejects an invalid character', async () => {
    const bad = { v: 1, ...payload, character: { ...character, spec: 'fury' } };
    await expect(decodeShare(await rawFragment(bad))).rejects.toThrow(/character\.spec/);
  });

  it.each([
    ['iterations', { iterations: -5 }],
    ['seed', { seed: 1.5 }],
    ['engineId', { engineId: '../../x y' }],
    ['kind', { kind: 'nope' }],
  ])('rejects a bad %s', async (field, patch) => {
    const text = await rawFragment({ v: 1, ...payload, ...patch });
    await expect(decodeShare(text)).rejects.toThrow(new RegExp(field));
  });

  it.each([
    ['empty', ''],
    ['not base64url', 'abc+/='],
    ['not deflate', 'aGVsbG8gd29ybGQ'],
    ['truncated', 'q1YqU7Iy1FFKUbIyNDDQUcpVsjI'],
  ])('rejects %s input as ShareLinkError', async (_name, text) => {
    await expect(decodeShare(text)).rejects.toBeInstanceOf(ShareLinkError);
  });

  it('rejects valid deflate of non-JSON and of JSON that is not an object', async () => {
    const bytes = new TextEncoder().encode('not json');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')));
    await expect(decodeShare(toBase64Url(new Uint8Array(await out.arrayBuffer())))).rejects.toThrow(
      /garbled/,
    );
    await expect(decodeShare(await rawFragment([1, 2]))).rejects.toThrow(/no format version/);
  });
});
