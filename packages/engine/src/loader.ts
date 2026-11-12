// Fetches, verifies, decompresses and compiles the engine WASM once on the host. Each worker gets
// the compiled WebAssembly.Module by structured clone (one download and one compile for N workers).
import type { EngineLock, EngineVersion } from '@fsim/contracts';

export interface EngineAssets {
  /** The compiled engine. */
  module: WebAssembly.Module;
  /** Where workers import `wasm_exec.js` from: a data: URL of the verified bytes, or a plain URL. */
  wasmExecUrl: string;
}

type Bytes = Uint8Array | ArrayBuffer;

export interface EngineAssetSources {
  /** `lib.wasm` or `lib.wasm.gz` (gzip is detected by magic bytes): a URL, or the bytes themselves. */
  wasm: string | URL | Bytes;
  /** `wasm_exec.js` from the Go version that built the WASM: a URL, or its bytes. */
  wasmExec: string | URL | Bytes;
  /** Expected sha256 (hex) of the bytes as fetched, i.e. of the `.gz` when the WASM is gzipped. */
  sha256?: { wasm?: string | undefined; wasmExec?: string | undefined };
  /** How to read a URL. Defaults to `fetch`; the Node entry passes one that also reads files. */
  fetchBytes?: (url: string) => Promise<Uint8Array>;
}

export class EngineIntegrityError extends Error {
  constructor(what: string, expected: string, actual: string) {
    super(`${what}: sha256 ${actual} does not match engine.lock.json (${expected})`);
    this.name = 'EngineIntegrityError';
  }
}

export const defaultFetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

const toU8 = (b: Bytes) => (b instanceof Uint8Array ? b : new Uint8Array(b));

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b;

/** Gunzips with DecompressionStream (browsers, Node >= 18) when the bytes are gzip; otherwise returns them. */
export async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes;
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

async function verify(what: string, bytes: Uint8Array, expected: string | undefined) {
  if (!expected) return;
  const actual = await sha256Hex(bytes);
  if (actual !== expected.toLowerCase()) throw new EngineIntegrityError(what, expected, actual);
}

export async function loadEngineAssets(src: EngineAssetSources): Promise<EngineAssets> {
  const fetchBytes = src.fetchBytes ?? defaultFetchBytes;
  const read = async (s: string | URL | Bytes) =>
    typeof s === 'string' || s instanceof URL ? fetchBytes(String(s)) : toU8(s);

  const [wasmRaw, execRaw] = await Promise.all([read(src.wasm), read(src.wasmExec)]);
  await Promise.all([
    verify('engine wasm', wasmRaw, src.sha256?.wasm),
    verify('wasm_exec.js', execRaw, src.sha256?.wasmExec),
  ]);
  const module = await WebAssembly.compile((await gunzipIfNeeded(wasmRaw)) as Uint8Array<ArrayBuffer>);
  return { module, wasmExecUrl: toDataUrl(execRaw, 'text/javascript') };
}

/**
 * Asset sources for the engine pinned in engine.lock.json, with the lock's sha256s, or null while the
 * pipeline has not published artifacts for it yet (`artifacts: null`).
 */
export function assetSourcesFromLock(lock: EngineLock): EngineAssetSources | null {
  if (!lock.artifacts) return null;
  const { wasm, wasmExec } = lock.artifacts;
  return { wasm: wasm.url, wasmExec: wasmExec.url, sha256: { wasm: wasm.sha256, wasmExec: wasmExec.sha256 } };
}

export const engineVersionFromLock = (lock: EngineLock): EngineVersion => ({
  engineId: lock.engineId,
  commit: lock.upstream.commit,
  dataBuild: lock.dataBuild,
});
