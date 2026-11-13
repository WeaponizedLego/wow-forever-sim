#!/usr/bin/env node
// smoke: sim every upstream test suite's default setup through the freshly built WASM in Node.
//
//   node tools/engine-build/smoke.mjs <commit> [--no-write] [--tolerance 0.25] [--workers N]
//
// Run after build.mjs <commit> (uses its clone and out/<id>/). Steps:
//   1. Inject a hook into the clone's sim/core (smoke/fsim_smoke_*.go.txt) and run every spec's
//      upstream test suite with `go test -tags with_db,fsim_smoke`. The hook does not run the suite:
//      it writes the suite's "Average-Default" RaidSimRequest (with the per-player SimDatabase the
//      WASM needs) and the native DPS upstream's .results file expects for it.
//   2. Run each request through out/<id>/lib.wasm.gz in worker threads (raidSimJson).
//   3. Fail if any sim errors, does not finish its iterations, returns 0 DPS, or moves more than
//      ±tolerance from tools/engine-build/smoke-baseline.json. WASM vs native mismatches are
//      reported as warnings.
//   4. Write out/<id>/smoke-report.md (the PR body table) and smoke-results.json, and, if
//      everything passed and --no-write is not set, the new smoke-baseline.json.
// Exit code 1 on any failure.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { Worker } from 'node:worker_threads';
import { gunzipSync } from 'node:zlib';
import {
  BASELINE_PATH,
  cloneDir,
  fail,
  goEnv,
  log,
  outDir,
  parseArgs,
  readJson,
  run,
  setOutput,
  shortId,
  TOOL_DIR,
  writeJson,
} from './lib.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const commit = positional[0];
if (!/^[0-9a-f]{40}$/.test(commit ?? '')) fail('usage: smoke.mjs <40-char upstream commit>');
const engineId = shortId(commit);
const clone = cloneDir(engineId);
const out = outDir(engineId);
const tolerance = Number(flags.tolerance ?? process.env.SMOKE_TOLERANCE ?? 0.25);
for (const f of ['lib.wasm.gz', 'wasm_exec.js']) {
  if (!existsSync(join(out, f))) fail(`${join(out, f)} missing; run build.mjs ${commit} first`);
}
const timings = {};
const t0 = performance.now();

// 1. Inject the export hook.
const core = join(clone, 'sim/core');
copyFileSync(join(TOOL_DIR, 'smoke/fsim_smoke_hook.go.txt'), join(core, 'zz_fsim_smoke_hook.go'));
copyFileSync(join(TOOL_DIR, 'smoke/fsim_smoke_stub.go.txt'), join(core, 'zz_fsim_smoke_stub.go'));
const suitePath = join(core, 'test_suite.go');
let suiteSrc = readFileSync(suitePath, 'utf8');
if (!suiteSrc.includes('fsimSmokeHook(')) {
  const anchor = /func RunTestSuite\((\w+) \*testing\.T, (\w+) string, (\w+) \[\]TestGenerator\) \{\n/;
  if (!anchor.test(suiteSrc)) {
    fail('upstream RunTestSuite signature changed; update the anchor in smoke.mjs and the smoke hook');
  }
  suiteSrc = suiteSrc.replace(
    anchor,
    (m, _t, name, gens) => `${m}\tif fsimSmokeHook(${name}, ${gens}) {\n\t\treturn\n\t}\n`,
  );
  writeFileSync(suitePath, suiteSrc);
}

// 2. Find the suites: every sim/**/<TestName>.results outside sim/core.
const suites = new Map(); // package dir (relative) -> test names
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.results') && !p.startsWith(core)) {
      const pkg = `./${relative(clone, dir)}`;
      suites.set(pkg, [...(suites.get(pkg) ?? []), e.name.replace(/\.results$/, '')]);
    }
  }
})(join(clone, 'sim'));
const testNames = [...new Set([...suites.values()].flat())].sort();
log(`${testNames.length} suites in ${suites.size} packages`);

// 3. Export requests with the native toolchain.
const reqDir = join(out, 'smoke-requests');
rmSync(reqDir, { recursive: true, force: true });
mkdirSync(reqDir, { recursive: true });
let tx = performance.now();
run(
  'go',
  ['test', '-tags', 'with_db,fsim_smoke', '-count=1', '-run', `^(${testNames.join('|')})$`, ...suites.keys()],
  { cwd: clone, env: goEnv({ FSIM_SMOKE_OUT: reqDir }) },
);
timings.export = Math.round(performance.now() - tx);

const metas = readdirSync(reqDir)
  .filter((f) => f.endsWith('.meta.json'))
  .map((f) => readJson(join(reqDir, f)))
  .sort((a, b) => a.suite.localeCompare(b.suite));
const missing = testNames.filter((n) => !metas.some((m) => m.suite === n));
const jobs = metas.filter((m) => !m.skip);
const skipped = Object.fromEntries(metas.filter((m) => m.skip).map((m) => [m.suite, m.skip]));
for (const n of missing)
  skipped[n] = 'suite never reached RunTestSuite (skipped upstream with t.Skip, or no export written)';

// 4. Run them through the WASM.
tx = performance.now();
const module = await WebAssembly.compile(gunzipSync(readFileSync(join(out, 'lib.wasm.gz'))));
const nWorkers = Math.max(
  1,
  Math.min(jobs.length, Number(flags.workers ?? process.env.SMOKE_WORKERS ?? availableParallelism())),
);
const results = new Map();
await new Promise((resolve, reject) => {
  const queue = [...jobs];
  let live = nWorkers;
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(new URL('./smoke/wasm-worker.mjs', import.meta.url), {
      workerData: { wasmExec: join(out, 'wasm_exec.js'), module },
    });
    const next = () => {
      const job = queue.shift();
      if (!job) {
        w.terminate();
        if (--live === 0) resolve();
        return;
      }
      w.postMessage({ suite: job.suite, requestPath: join(reqDir, `${job.suite}.request.json`) });
    };
    w.on('message', (msg) => {
      if (!msg.ready) {
        results.set(msg.suite, msg);
        log(
          `${msg.suite}: ${msg.error ? `ERROR ${msg.error}` : `${msg.dps.toFixed(2)} dps`} (${(msg.ms / 1000).toFixed(1)} s)`,
        );
      }
      next();
    });
    w.on('error', reject);
  }
});
timings.wasm = Math.round(performance.now() - tx);

// 5. Judge against the baseline.
const baseline = existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH) : { specs: {} };
const rows = [];
const warnings = [];
let failed = false;
for (const job of jobs) {
  const r = results.get(job.suite) ?? { error: 'no result' };
  const prev = baseline.specs?.[job.suite];
  const row = {
    suite: job.suite,
    spec: job.spec,
    prev: prev?.dps ?? null,
    prevEngine: prev?.engineId ?? null,
    ...r,
  };
  row.delta = prev?.dps ? (r.dps - prev.dps) / prev.dps : null;
  row.native = job.nativeDps ?? null;
  if (r.error) row.status = 'FAIL: error';
  else if (!(r.dps > 0)) row.status = 'FAIL: zero DPS';
  else if (r.iterations !== job.iterations) row.status = `FAIL: ${r.iterations}/${job.iterations} iterations`;
  else if (row.delta !== null && Math.abs(row.delta) > tolerance)
    row.status = `FAIL: outside ±${tolerance * 100}%`;
  else row.status = prev ? 'ok' : 'new';
  if (row.status.startsWith('FAIL')) failed = true;
  if (!r.error && row.native !== null && Math.abs(r.dps - row.native) > 0.01) {
    warnings.push(
      `${job.suite}: WASM ${r.dps.toFixed(3)} DPS vs native .results ${row.native.toFixed(3)} (same request and seed)`,
    );
  }
  rows.push(row);
}
const gone = Object.keys(baseline.specs ?? {}).filter((s) => !jobs.some((j) => j.suite === s));
for (const s of gone)
  warnings.push(
    `${s}: in the previous baseline but not smoke-tested now (${skipped[s] ?? 'suite removed upstream'})`,
  );
timings.total = Math.round(performance.now() - t0);

// 6. Report.
const fmt = (n) => (n === null || n === undefined ? '–' : n.toFixed(1));
const pct = (d) => (d === null ? '–' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(2)}%`);
const prevIds = [...new Set(rows.map((r) => r.prevEngine).filter(Boolean))];
const md = [
  `### Engine smoke test: ${prevIds.length ? prevIds.join(', ') : '(no baseline)'} → \`${engineId}\``,
  '',
  `${rows.length} specs simmed in WASM (Node), ${rows[0]?.iterations ?? '?'} iterations each, upstream's own ` +
    `default setup per spec (test suite "Average-Default"). Pass: no error and DPS within ±${tolerance * 100}% of the baseline.`,
  '',
  '| Suite | Spec | Previous DPS | New DPS | Δ | Native .results | Status |',
  '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.suite} | ${r.spec ?? '?'} | ${fmt(r.prev)} | ${r.error ? 'error' : fmt(r.dps)} | ${pct(r.delta)} | ` +
      `${r.native === null ? '–' : !r.error && Math.abs(r.dps - r.native) <= 0.01 ? 'match' : `differs (${fmt(r.native)})`} | ${r.status} |`,
  ),
  '',
];
if (Object.keys(skipped).length) {
  md.push('Not smoke-tested:', '', ...Object.entries(skipped).map(([s, why]) => `- ${s}: ${why}`), '');
}
if (warnings.length) md.push('Warnings:', '', ...warnings.map((w) => `- ${w}`), '');
const errors = rows.filter((r) => r.error);
if (errors.length) {
  md.push('Errors:', '', '```', ...errors.map((r) => `${r.suite}: ${r.error.slice(0, 2000)}`), '```', '');
}
md.push(
  `Export ${(timings.export / 1000).toFixed(0)} s, WASM sims ${(timings.wasm / 1000).toFixed(0)} s on ${nWorkers} workers.`,
);
const report = md.join('\n');
writeFileSync(join(out, 'smoke-report.md'), `${report}\n`);
writeJson(join(out, 'smoke-results.json'), {
  engineId,
  commit,
  tolerance,
  failed,
  rows,
  skipped,
  warnings,
  timings,
});
console.log(report);

if (!failed && !flags['no-write']) {
  const specs = Object.fromEntries(
    rows.map((r) => [
      r.suite,
      { spec: r.spec, dps: r.dps, stdev: r.stdev, iterations: r.iterations, engineId },
    ]),
  );
  writeJson(BASELINE_PATH, {
    engineId,
    commit,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    tolerance,
    specs,
    skipped,
  });
  log(`wrote ${BASELINE_PATH}`);
}
setOutput({ failed, report: join(out, 'smoke-report.md') });
log(`smoke ${failed ? 'FAILED' : 'passed'} in ${(timings.total / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
