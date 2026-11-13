#!/usr/bin/env node
// check: is the engine wowsims.com/forever serves newer than engine.lock.json?
//
//   node tools/engine-build/check.mjs [--commit <sha|ref>] [--force]
//
// Prints {"update", "commit", "engineId", "current"} as JSON on stdout and, in GitHub Actions,
// writes the same keys to $GITHUB_OUTPUT. Always exits 0 unless the lookup itself fails.
// --commit overrides version.json (workflow_dispatch input); a short sha or ref is resolved via the
// GitHub API. --force reports update=true even when the commit equals the lock (rebuild).
import {
  fetchUpstreamCommit,
  githubApi,
  parseArgs,
  readLock,
  setOutput,
  shortId,
  UPSTREAM_REPO,
} from './lib.mjs';

const { flags } = parseArgs(process.argv.slice(2));

async function resolveCommit(ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  const c = await githubApi(`/repos/${UPSTREAM_REPO}/commits/${encodeURIComponent(ref)}`);
  return c.sha;
}

const requested = typeof flags.commit === 'string' && flags.commit.trim() ? flags.commit.trim() : null;
const commit = requested ? await resolveCommit(requested) : await fetchUpstreamCommit();
const lock = readLock();
const current = lock?.upstream?.commit ?? null;
// A lock without artifacts was never built by this pipeline, so it needs a build too.
const update = Boolean(flags.force) || commit !== current || !lock?.artifacts;

const result = {
  update,
  commit,
  engineId: shortId(commit),
  current,
  source: requested ? 'input' : 'version.json',
};
console.log(JSON.stringify(result));
setOutput(result);
