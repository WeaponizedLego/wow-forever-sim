#!/usr/bin/env node
// Fills packages/engine/vendor/ with the engine release engine.lock.json names: the same files CI and the
// deployed app use, sha256-verified. The quick way to bring the local engine up to the locked commit after an
// engine sync; build-local.mjs is for building from an upstream checkout (engine patches, an unreleased commit).
//
//   node packages/engine/scripts/vendor-release.mjs
//   node apps/web/scripts/stage-engine.mjs            # then stage the browser copy
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(pkgDir, 'vendor');
const lock = JSON.parse(readFileSync(resolve(pkgDir, '../../engine.lock.json'), 'utf8'));
if (!lock.artifacts) {
  console.error('engine.lock.json names no release. Build from source with build-local.mjs.');
  process.exit(1);
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Download and verify everything before writing, so a failed run leaves vendor/ as it was.
const named = { wasm: 'lib.wasm', wasmExec: 'wasm_exec.js', db: 'db.bin', leftoverDb: 'leftover_db.bin' };
const files = {};
for (const [key, file] of Object.entries(named)) {
  const art = lock.artifacts[key];
  const res = await fetch(art.url);
  if (!res.ok) throw new Error(`${art.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== art.sha256) throw new Error(`${file}: sha256 does not match engine.lock.json`);
  // The release ships lib.wasm gzipped; vendor/ holds it raw, as build-local.mjs writes it.
  files[file] = key === 'wasm' ? gunzipSync(buf) : buf;
}
mkdirSync(vendor, { recursive: true });
for (const [file, buf] of Object.entries(files)) writeFileSync(join(vendor, file), buf);
const manifest = { commit: lock.upstream.commit, source: 'release', fetchedAt: new Date().toISOString() };
writeFileSync(join(vendor, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`vendor/ is the ${lock.engineId} release. Next: node apps/web/scripts/stage-engine.mjs`);
