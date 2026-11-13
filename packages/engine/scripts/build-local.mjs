#!/usr/bin/env node
// Builds the engine WASM from a local wowsims/forever checkout into packages/engine/vendor/ for dev
// and tests. Local only: the real artifacts come from the engine-sync pipeline (lane L1).
//
//   node packages/engine/scripts/build-local.mjs --src /path/to/forever
//   FSIM_FOREVER_SRC=/path/to/forever node packages/engine/scripts/build-local.mjs
//
// Writes vendor/lib.wasm, vendor/wasm_exec.js (from the same Go toolchain), vendor/db.bin,
// vendor/leftover_db.bin and vendor/manifest.json (commit, Go version, sha256 of each file).
// Needs Go (GOTOOLCHAIN=auto fetches the version upstream's go.mod asks for) and protoc. Installs
// protoc-gen-go into vendor/.gobin when it is not on PATH; nothing is installed globally.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgDir, '../..');
const vendor = join(pkgDir, 'vendor');
const gobin = join(vendor, '.gobin');

const argIdx = process.argv.indexOf('--src');
const src = resolve(argIdx > 0 ? process.argv[argIdx + 1] : (process.env.FSIM_FOREVER_SRC ?? ''));
if (!src || !existsSync(join(src, 'sim/wasm/main.go'))) {
  console.error('Pass --src <wowsims/forever checkout> or set FSIM_FOREVER_SRC.');
  process.exit(1);
}

const env = { ...process.env, GOTOOLCHAIN: 'auto', GOBIN: gobin, PATH: `${gobin}:${process.env.PATH}` };
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: src, env, stdio: ['ignore', 'pipe', 'inherit'], ...opts })
    .toString()
    .trim();
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

mkdirSync(gobin, { recursive: true });
const lock = JSON.parse(readFileSync(join(repoRoot, 'engine.lock.json'), 'utf8'));
const commit = run('git', ['rev-parse', 'HEAD']);
if (commit !== lock.upstream.commit) {
  console.warn(`warning: checkout is at ${commit}, engine.lock.json pins ${lock.upstream.commit}`);
}

// 1. Go protos (skipped when the checkout already has them).
if (!existsSync(join(src, 'sim/core/proto/api.pb.go'))) {
  try {
    run('which', ['protoc-gen-go']);
  } catch {
    const goMod = readFileSync(join(src, 'go.mod'), 'utf8');
    const version = /google\.golang\.org\/protobuf (v[\w.-]+)/.exec(goMod)?.[1] ?? 'latest';
    console.log(`installing protoc-gen-go@${version} into ${gobin}`);
    run('go', ['install', `google.golang.org/protobuf/cmd/protoc-gen-go@${version}`]);
  }
  const protos = readdirSync(join(src, 'proto'))
    .filter((f) => f.endsWith('.proto'))
    .map((f) => `./proto/${f}`);
  console.log('generating Go protos');
  run('protoc', [
    '-I=./proto',
    '--go_opt=Mgoogle/protobuf/descriptor.proto=google.golang.org/protobuf/types/descriptorpb',
    '--go_out=./sim/core',
    ...protos,
  ]);
}

// 2. lib.wasm, built without with_db: item data travels in each request.
console.log('building lib.wasm');
const t0 = performance.now();
run('go', ['build', '-ldflags', '-w -s', '-o', join(vendor, 'lib.wasm'), './sim/wasm/'], {
  env: { ...env, GOOS: 'js', GOARCH: 'wasm' },
});
console.log(`built in ${Math.round((performance.now() - t0) / 1000)} s`);

// 3. wasm_exec.js from the same toolchain (Go >= 1.24 keeps it in lib/wasm, older in misc/wasm).
const goroot = run('go', ['env', 'GOROOT']);
const goVersion = run('go', ['env', 'GOVERSION']);
const wasmExec = [join(goroot, 'lib/wasm/wasm_exec.js'), join(goroot, 'misc/wasm/wasm_exec.js')].find(
  existsSync,
);
if (!wasmExec) throw new Error(`wasm_exec.js not found under ${goroot}`);
// The root ESLint config does not ignore vendor/ (it is gitignored, but ESLint does not read
// .gitignore), so mark the Go-authored file as not ours. Otherwise byte-for-byte upstream.
// (rm first: an older copy may carry GOROOT's read-only mode.)
rmSync(join(vendor, 'wasm_exec.js'), { force: true });
writeFileSync(join(vendor, 'wasm_exec.js'), '/* eslint-disable */\n' + readFileSync(wasmExec, 'utf8'));

// 4. Item database, for tests that build each player's SimDatabase subset.
for (const f of ['db.bin', 'leftover_db.bin']) {
  const from = join(src, 'assets/database', f);
  if (existsSync(from)) copyFileSync(from, join(vendor, f));
}

const files = Object.fromEntries(
  ['lib.wasm', 'wasm_exec.js', 'db.bin', 'leftover_db.bin']
    .filter((f) => existsSync(join(vendor, f)))
    .map((f) => [f, { sha256: sha256(join(vendor, f)), bytes: readFileSync(join(vendor, f)).length }]),
);
const manifest = { commit, goVersion, builtAt: new Date().toISOString(), files };
writeFileSync(join(vendor, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
