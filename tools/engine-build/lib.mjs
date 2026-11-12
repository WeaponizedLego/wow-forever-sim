// Shared helpers for the engine-sync scripts (check, build, smoke, promote).
// Node built-ins only, so the scripts run before and without `pnpm install`.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(TOOL_DIR, '../..');
export const LOCK_PATH = join(REPO_ROOT, 'engine.lock.json');
export const BASELINE_PATH = join(TOOL_DIR, 'smoke-baseline.json');

export const UPSTREAM_REPO = 'wowsims/forever';
export const UPSTREAM_GIT = `https://github.com/${UPSTREAM_REPO}.git`;
export const VERSION_URL = 'https://raw.githubusercontent.com/wowsims/pages-deploy/main/forever/version.json';
/** Where the workflow publishes artifacts: one GitHub release per engine version. */
export const RELEASE_REPO = process.env.ENGINE_RELEASE_REPO ?? 'WeaponizedLego/wow-forever-sim';
export const releaseUrl = (engineId, file) =>
  `https://github.com/${RELEASE_REPO}/releases/download/engine-${engineId}/${file}`;

/**
 * Build work dir: clones and outputs (~70 MB per engine). Outside the repo by default so prettier,
 * eslint and vitest never walk it; override with ENGINE_BUILD_WORK.
 */
export const WORK_DIR = resolve(process.env.ENGINE_BUILD_WORK ?? join(tmpdir(), 'fsim-engine-build'));
export const cloneDir = (engineId) => join(WORK_DIR, `forever-${engineId}`);
export const outDir = (engineId) => join(WORK_DIR, 'out', engineId);
export const GOBIN = join(WORK_DIR, 'gobin');

export const shortId = (commit) => commit.slice(0, 7);

export function log(...args) {
  console.error('[engine-build]', ...args);
}

export function fail(msg) {
  console.error(`[engine-build] ERROR: ${msg}`);
  process.exit(1);
}

/** Runs a command, streaming its output; throws on a non-zero exit. */
export function run(cmd, args, opts = {}) {
  log('$', cmd, ...args);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`);
}

/** Runs a command and returns its trimmed stdout. */
export function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
}

export function which(cmd) {
  const r = spawnSync('sh', ['-c', `command -v "${cmd}"`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export const fileSize = (path) => statSync(path).size;

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export function readLock() {
  return existsSync(LOCK_PATH) ? readJson(LOCK_PATH) : null;
}

export async function fetchUpstreamCommit() {
  const res = await fetch(VERSION_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${VERSION_URL}: ${res.status}`);
  const { commit } = await res.json();
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`unexpected version.json: ${commit}`);
  return commit;
}

/** GitHub API GET with the workflow token when present (60 req/h unauthenticated otherwise). */
export async function githubApi(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'engine-build' };
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

/** Writes key=value lines to $GITHUB_OUTPUT when running in Actions. */
export function setOutput(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  for (const [k, v] of Object.entries(values)) {
    const s = String(v);
    if (s.includes('\n')) {
      const delim = `EOF_${Math.random().toString(36).slice(2)}`;
      appendFileSync(file, `${k}<<${delim}\n${s}\n${delim}\n`);
    } else {
      appendFileSync(file, `${k}=${s}\n`);
    }
  }
}

/** Env for Go commands: local GOBIN first on PATH, toolchain fetched per go.mod. */
export function goEnv(extra = {}) {
  return {
    ...process.env,
    GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? 'auto',
    GOBIN,
    PATH: `${GOBIN}:${process.env.PATH}`,
    ...extra,
  };
}

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else positional.push(a);
  }
  return { flags, positional };
}
