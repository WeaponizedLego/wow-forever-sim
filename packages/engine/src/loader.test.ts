import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { EngineIntegrityError, loadEngineAssets } from './loader';

// The smallest valid WebAssembly module: magic + version.
const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const GZ = new Uint8Array(gzipSync(WASM));
const EXEC = new TextEncoder().encode('// wasm_exec');
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('loadEngineAssets integrity', () => {
  const sha256 = { wasm: sha(GZ), wasmRaw: sha(WASM), wasmExec: sha(EXEC) };

  it('checks gzip bytes against the published .gz hash', async () => {
    await expect(loadEngineAssets({ wasm: GZ, wasmExec: EXEC, sha256 })).resolves.toHaveProperty('module');
  });

  it('checks bytes a server already unzipped (Content-Encoding: gzip) against the unzipped hash', async () => {
    await expect(loadEngineAssets({ wasm: WASM, wasmExec: EXEC, sha256 })).resolves.toHaveProperty('module');
  });

  it('fails closed on unzipped bytes when only the .gz hash is known', async () => {
    await expect(
      loadEngineAssets({ wasm: WASM, wasmExec: EXEC, sha256: { wasm: sha(GZ), wasmExec: sha(EXEC) } }),
    ).rejects.toBeInstanceOf(EngineIntegrityError);
  });

  it('rejects tampered bytes', async () => {
    const bad = new Uint8Array(gzipSync(new Uint8Array([...WASM, 0x00])));
    await expect(loadEngineAssets({ wasm: bad, wasmExec: EXEC, sha256 })).rejects.toBeInstanceOf(
      EngineIntegrityError,
    );
  });
});
