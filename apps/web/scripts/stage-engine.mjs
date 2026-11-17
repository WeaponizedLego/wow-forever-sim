// Puts the engine files the browser needs under public/engine/<engineId>/ and writes
// public/engine/current.json, so the app always loads the engine from its own origin.
//
// Source, in order:
//   1. packages/engine/vendor/ (a local build: scripts/build-local.mjs) — dev
//   2. the release assets named in engine.lock.json, sha256-verified — CI / deploy
//
// --optional: if neither is available, warn and exit 0 (the app shows "engine unavailable").
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '../..');
const vendor = join(root, 'packages/engine/vendor');
const optional = process.argv.includes('--optional');
const lock = JSON.parse(readFileSync(join(root, 'engine.lock.json'), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const outRoot = join(web, 'public/engine');
const files = ['lib.wasm.gz', 'wasm_exec.js', 'db.bin', 'leftover_db.bin'];

async function main() {
  let engineId, source;
  const bytes = {};

  if (existsSync(join(vendor, 'lib.wasm')) && existsSync(join(vendor, 'wasm_exec.js'))) {
    const manifest = existsSync(join(vendor, 'manifest.json'))
      ? JSON.parse(readFileSync(join(vendor, 'manifest.json'), 'utf8'))
      : {};
    engineId = `${String(manifest.commit ?? lock.upstream.commit).slice(0, 7)}-local`;
    source = 'local';
    bytes['lib.wasm.gz'] = gzipSync(readFileSync(join(vendor, 'lib.wasm')), { level: 9 });
    bytes['wasm_exec.js'] = readFileSync(join(vendor, 'wasm_exec.js'));
    bytes['db.bin'] = readFileSync(join(vendor, 'db.bin'));
    bytes['leftover_db.bin'] = readFileSync(join(vendor, 'leftover_db.bin'));
  } else if (lock.artifacts) {
    engineId = lock.engineId;
    source = 'release';
    const named = {
      'lib.wasm.gz': 'wasm',
      'wasm_exec.js': 'wasmExec',
      'db.bin': 'db',
      'leftover_db.bin': 'leftoverDb',
    };
    for (const [file, key] of Object.entries(named)) {
      const art = lock.artifacts[key];
      const res = await fetch(art.url).catch((e) => ({ ok: false, status: e.message }));
      if (!res.ok) {
        // A release that isn't published yet (or a network failure) is "no engine" for an optional build.
        // A sha256 mismatch below is an integrity error and always fails.
        const msg = `${art.url}: HTTP ${res.status}`;
        if (optional) {
          console.warn(
            `stage-engine: ${msg}. Building without an engine; the app will show it as unavailable.`,
          );
          rmSync(join(outRoot, 'current.json'), { force: true });
          return;
        }
        throw new Error(msg);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha256(buf) !== art.sha256) throw new Error(`${file}: sha256 does not match engine.lock.json`);
      bytes[file] = buf;
    }
  } else {
    const msg = 'No engine: packages/engine/vendor/ is empty and engine.lock.json has no artifacts.';
    if (optional) {
      console.warn(`stage-engine: ${msg} The app will show the engine as unavailable.`);
      rmSync(join(outRoot, 'current.json'), { force: true });
      return;
    }
    throw new Error(`${msg} Run packages/engine/scripts/build-local.mjs.`);
  }

  const dir = join(outRoot, engineId);
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f), bytes[f]);
  const current = {
    engineId,
    source,
    commit: lock.upstream.commit,
    dataBuild: lock.dataBuild,
    base: `/engine/${engineId}/`,
    sha256: Object.fromEntries(files.map((f) => [f, sha256(bytes[f])])),
    // For servers that send lib.wasm.gz with Content-Encoding: gzip (the browser then hands over lib.wasm).
    wasmRawSha256: sha256(gunzipSync(bytes['lib.wasm.gz'])),
  };
  writeFileSync(join(outRoot, 'current.json'), JSON.stringify(current, null, 2) + '\n');
  console.log(`stage-engine: ${source} engine ${engineId} → public/engine/${engineId}/`);
}

main().catch((e) => {
  console.error(`stage-engine: ${e.message}`);
  process.exit(1);
});
