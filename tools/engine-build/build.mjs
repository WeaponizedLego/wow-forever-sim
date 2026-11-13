#!/usr/bin/env node
// build: compile the upstream engine at one commit into release artifacts and a candidate lock.
//
//   node tools/engine-build/build.mjs <commit> [--require-wasm-opt] [--no-protos] [--fresh]
//
// Needs: git, go (any recent; GOTOOLCHAIN=auto fetches upstream's version), protoc, and
// `pnpm install` done (for the TypeScript proto generator). wasm-opt (binaryen) is optional
// locally; set WASM_OPT to point at a binary that is not on PATH.
//
// Writes to $ENGINE_BUILD_WORK (default $TMPDIR/fsim-engine-build, outside the repo):
//   forever-<id>/                 shallow clone of upstream at <commit>
//   out/<id>/lib.wasm.gz          engine, wasm-opt -O3 (if available), gzip -9
//   out/<id>/wasm_exec.js         from the same Go toolchain that built lib.wasm
//   out/<id>/db.bin, leftover_db.bin
//   out/<id>/engine.lock.json     candidate lock (artifact URLs point at release engine-<id>)
//   out/<id>/build-info.json      sizes and timings
// and, unless --no-protos, replaces packages/proto/proto/*.proto with upstream's and regenerates
// packages/proto/src/generated.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  capture,
  cloneDir,
  fail,
  fileSize,
  GOBIN,
  goEnv,
  githubApi,
  log,
  outDir,
  parseArgs,
  releaseUrl,
  REPO_ROOT,
  run,
  sha256File,
  shortId,
  UPSTREAM_GIT,
  UPSTREAM_REPO,
  which,
  writeJson,
} from './lib.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const commit = positional[0];
if (!/^[0-9a-f]{40}$/.test(commit ?? '')) fail('usage: build.mjs <40-char upstream commit>');
const engineId = shortId(commit);
const clone = cloneDir(engineId);
const out = outDir(engineId);
const timings = {};
const time = (name, fn) => {
  const t0 = performance.now();
  const r = fn();
  timings[name] = Math.round(performance.now() - t0);
  log(`${name}: ${(timings[name] / 1000).toFixed(1)} s`);
  return r;
};

if (!which('protoc')) fail('protoc not found on PATH');

// 1. Shallow clone at the commit. Reuses an existing clone of the same commit (git clean resets it).
time('clone', () => {
  if (!flags.fresh && existsSync(join(clone, '.git'))) {
    const head = capture('git', ['rev-parse', 'HEAD'], { cwd: clone });
    if (head === commit) {
      run('git', ['reset', '-q', '--hard'], { cwd: clone });
      run('git', ['clean', '-q', '-fdx'], { cwd: clone });
      return;
    }
  }
  rmSync(clone, { recursive: true, force: true });
  mkdirSync(clone, { recursive: true });
  run('git', ['init', '-q'], { cwd: clone });
  run('git', ['remote', 'add', 'origin', UPSTREAM_GIT], { cwd: clone });
  run('git', ['fetch', '-q', '--depth', '1', 'origin', commit], { cwd: clone });
  run('git', ['checkout', '-q', '--detach', 'FETCH_HEAD'], { cwd: clone });
});
const committedAt = capture('git', ['log', '-1', '--format=%cI'], { cwd: clone });
const env = goEnv();
const goVersion = capture('go', ['env', 'GOVERSION'], { cwd: clone, env }).replace(/^go/, '');
const goroot = capture('go', ['env', 'GOROOT'], { cwd: clone, env });
log(`upstream ${commit} (${committedAt}), Go ${goVersion}`);

// 2. protoc-gen-go at the protobuf version upstream's go.mod requires, into a local GOBIN.
time('protoc-gen-go', () => {
  const goMod = readFileSync(join(clone, 'go.mod'), 'utf8');
  const pbVersion = goMod.match(/google\.golang\.org\/protobuf (v[^\s]+)/)?.[1] ?? 'latest';
  mkdirSync(GOBIN, { recursive: true });
  run('go', ['install', `google.golang.org/protobuf/cmd/protoc-gen-go@${pbVersion}`], { cwd: clone, env });
});

// 3. Go protos, the same command as upstream's makefile (sim/core/proto/api.pb.go target).
time('go-protos', () => {
  const protos = readdirSync(join(clone, 'proto'))
    .filter((f) => f.endsWith('.proto'))
    .map((f) => `./proto/${f}`);
  run(
    'protoc',
    [
      '-I=./proto',
      '--go_opt=Mgoogle/protobuf/descriptor.proto=google.golang.org/protobuf/types/descriptorpb',
      '--go_out=./sim/core',
      ...protos,
    ],
    { cwd: clone, env },
  );
});

// 4. The WASM.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const wasmPath = join(out, 'lib.wasm');
time('go-build', () =>
  run('go', ['build', '-ldflags', '-w -s', '-o', wasmPath, './sim/wasm/'], {
    cwd: clone,
    env: { ...env, GOOS: 'js', GOARCH: 'wasm' },
  }),
);
const sizes = { wasmRaw: fileSize(wasmPath) };

// 5. wasm-opt -O3 with upstream's feature flags (makefile WASM_FEATURES).
const wasmOpt = process.env.WASM_OPT || which('wasm-opt');
if (wasmOpt) {
  const makefile = readFileSync(join(clone, 'makefile'), 'utf8');
  const features = makefile
    .match(/^WASM_FEATURES\s*:?=\s*(.+)$/m)?.[1]
    .trim()
    .split(/\s+/) ?? [
    '--enable-sign-ext',
    '--enable-nontrapping-float-to-int',
    '--enable-mutable-globals',
    '--enable-bulk-memory',
  ];
  time('wasm-opt', () => run(wasmOpt, ['-O3', ...features, wasmPath, '-o', `${wasmPath}.opt`]));
  copyFileSync(`${wasmPath}.opt`, wasmPath);
  rmSync(`${wasmPath}.opt`);
  sizes.wasmOpt = fileSize(wasmPath);
} else if (flags['require-wasm-opt']) {
  fail('wasm-opt not found (install binaryen or set WASM_OPT); --require-wasm-opt is set');
} else {
  console.warn('::warning::wasm-opt not found, lib.wasm is NOT optimised (install binaryen or set WASM_OPT)');
  sizes.wasmOpt = null;
}

// 6. gzip -9 (no name/mtime in the header, so the same input gives the same bytes).
time('gzip', () => writeFileSync(`${wasmPath}.gz`, gzipSync(readFileSync(wasmPath), { level: 9 })));
rmSync(wasmPath);
sizes.wasmGz = fileSize(`${wasmPath}.gz`);

// 7. wasm_exec.js from the same toolchain (lib/wasm since Go 1.24, misc/wasm before).
const wasmExec = [join(goroot, 'lib/wasm/wasm_exec.js'), join(goroot, 'misc/wasm/wasm_exec.js')].find(
  existsSync,
);
if (!wasmExec) fail(`wasm_exec.js not found under ${goroot}`);
copyFileSync(wasmExec, join(out, 'wasm_exec.js'));

// 8. Item database.
for (const f of ['db.bin', 'leftover_db.bin']) copyFileSync(join(clone, 'assets/database', f), join(out, f));

// 9. Data build: the game build named by the last "[DB] ..." commit that touched db.bin.
const dataBuild = await findDataBuild(commit);

// 10. Candidate lock.
const artifact = (file) => ({
  url: releaseUrl(engineId, file),
  sha256: sha256File(join(out, file)),
  bytes: fileSize(join(out, file)),
});
const lock = {
  schema: 1,
  upstream: { repo: UPSTREAM_REPO, commit, committedAt },
  engineId,
  dataBuild,
  goVersion,
  artifacts: {
    wasm: artifact('lib.wasm.gz'),
    wasmExec: artifact('wasm_exec.js'),
    db: artifact('db.bin'),
    leftoverDb: artifact('leftover_db.bin'),
  },
  syncedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
};
writeJson(join(out, 'engine.lock.json'), lock);

// 11. TypeScript protos.
if (!flags['no-protos']) {
  time('ts-protos', () => {
    const dest = join(REPO_ROOT, 'packages/proto/proto');
    for (const f of readdirSync(dest)) if (f.endsWith('.proto')) rmSync(join(dest, f));
    for (const f of readdirSync(join(clone, 'proto'))) {
      if (f.endsWith('.proto')) copyFileSync(join(clone, 'proto', f), join(dest, f));
    }
    run('node', [join(REPO_ROOT, 'packages/proto/scripts/generate.mjs')], { cwd: REPO_ROOT });
  });
}

writeJson(join(out, 'build-info.json'), { engineId, commit, goVersion, dataBuild, sizes, timings });
log(`artifacts in ${out}`);
log(`sizes: ${JSON.stringify(sizes)}`);
console.log(JSON.stringify({ engineId, out, sizes, timings }));

async function findDataBuild(sha) {
  try {
    const commits = await githubApi(
      `/repos/${UPSTREAM_REPO}/commits?path=assets/database/db.bin&sha=${sha}&per_page=20`,
    );
    for (const c of commits) {
      const subject = c.commit.message.split('\n')[0];
      const m = subject.startsWith('[DB]') && subject.match(/\b(\d+\.\d+\.\d+\.\d+)\b/);
      if (m) return m[1];
    }
    console.warn('::warning::no "[DB] ... <build>" commit found for db.bin; dataBuild = null');
  } catch (e) {
    console.warn(`::warning::dataBuild lookup failed (${e.message}); dataBuild = null`);
  }
  return null;
}
