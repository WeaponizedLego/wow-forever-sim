#!/usr/bin/env node
// promote: validate a candidate lock against EngineLockSchema (@fsim/contracts) and write it to
// engine.lock.json. Run after a passing smoke test.
//
//   node tools/engine-build/promote.mjs <commit>          # out/<id>/engine.lock.json -> engine.lock.json
//   node tools/engine-build/promote.mjs --validate [file] # only validate (default engine.lock.json)
//
// Imports the schema straight from packages/contracts/src/engine.ts (Node strips the types), so it
// needs `pnpm install` for zod.
import { join } from 'node:path';
import { fail, LOCK_PATH, log, outDir, parseArgs, readJson, REPO_ROOT, shortId, writeJson } from './lib.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const { EngineLockSchema } = await import(join(REPO_ROOT, 'packages/contracts/src/engine.ts'));

function validate(path) {
  const lock = readJson(path);
  const r = EngineLockSchema.safeParse(lock);
  if (!r.success)
    fail(`${path} does not match EngineLockSchema:\n${JSON.stringify(r.error.issues, null, 2)}`);
  log(`${path} matches EngineLockSchema`);
  return lock;
}

if (flags.validate) {
  validate(typeof flags.validate === 'string' ? flags.validate : LOCK_PATH);
} else {
  const commit = positional[0];
  if (!/^[0-9a-f]{40}$/.test(commit ?? ''))
    fail('usage: promote.mjs <40-char upstream commit> | --validate [file]');
  const lock = validate(join(outDir(shortId(commit)), 'engine.lock.json'));
  if (lock.upstream.commit !== commit) fail(`candidate lock is for ${lock.upstream.commit}, not ${commit}`);
  if (!lock.artifacts) fail('candidate lock has no artifacts');
  writeJson(LOCK_PATH, lock);
  log(`wrote ${LOCK_PATH} (${lock.engineId})`);
}
