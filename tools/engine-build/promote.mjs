#!/usr/bin/env node
// promote: validate a candidate lock against EngineLockSchema (@fsim/contracts) and write it to
// engine.lock.json, then regenerate the game data that follows the engine from build.mjs's clone.
// Run after a passing smoke test.
//
//   node tools/engine-build/promote.mjs <commit> [--no-data] # out/<id>/engine.lock.json -> engine.lock.json
//   node tools/engine-build/promote.mjs --validate [file]    # only validate (default engine.lock.json)
//
// Imports the schema straight from packages/contracts/src/engine.ts (Node strips the types), so it
// needs `pnpm install` for zod (and esbuild, for the presets). Unless --no-data, it also rewrites,
// from the upstream clone at <commit> (which has build.mjs's Go protos):
//   packages/gamedata/data/talents/   scripts/extract-talents.ts (trees + icons)
//   packages/gamedata/data/presets/   scripts/extract-presets.ts (builds wowsimcli with Go)
//   fixtures/gamedata/*.bin           upstream's db.bin and leftover_db.bin, which the gamedata tests decode
//   fixtures/engine/sv-raidsim-request.json  the "sv" preset's request (spike/request-builder), which the
//                                     gamedata tests rebuild from the presets above
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  cloneDir,
  fail,
  goEnv,
  LOCK_PATH,
  log,
  outDir,
  parseArgs,
  readJson,
  REPO_ROOT,
  run,
  shortId,
  TOOL_DIR,
  writeJson,
} from './lib.mjs';

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

/** Talent trees, spec presets and the gamedata fixtures, regenerated from the upstream clone. */
function regenerateData(clone) {
  const env = goEnv();
  const script = (name) => join(REPO_ROOT, 'packages/gamedata/scripts', name);
  run('node', [script('extract-talents.ts'), '--upstream', clone], { cwd: REPO_ROOT, env });
  run('node', [script('extract-presets.ts'), '--upstream', clone], { cwd: REPO_ROOT, env });
  for (const f of ['db.bin', 'leftover_db.bin'])
    copyFileSync(join(clone, 'assets/database', f), join(REPO_ROOT, 'fixtures/gamedata', f));

  const spike = join(TOOL_DIR, 'spike/request-builder');
  mkdirSync(join(clone, 'cmd/spike'), { recursive: true });
  copyFileSync(join(spike, 'main.go'), join(clone, 'cmd/spike/main.go'));
  copyFileSync(join(spike, 'zz_spike_export.go.txt'), join(clone, 'cmd/wowsimcli/cmd/zz_spike_export.go'));
  mkdirSync(join(clone, 'out'), { recursive: true });
  run(
    'go',
    [
      'run',
      '-tags',
      'with_db',
      './cmd/spike',
      'ui/specs/hunter/dps/builds/sv.siml',
      'out/sv-request',
      'out/sv-statweights',
    ],
    { cwd: clone, env },
  );
  copyFileSync(
    join(clone, 'out/sv-request.json'),
    join(REPO_ROOT, 'fixtures/engine/sv-raidsim-request.json'),
  );

  const prettier = join(REPO_ROOT, 'node_modules/prettier/bin/prettier.cjs');
  run(process.execPath, [prettier, '--write', 'packages/gamedata/data'], { cwd: REPO_ROOT });
}

if (flags.validate) {
  validate(typeof flags.validate === 'string' ? flags.validate : LOCK_PATH);
} else {
  const commit = positional[0];
  if (!/^[0-9a-f]{40}$/.test(commit ?? ''))
    fail('usage: promote.mjs <40-char upstream commit> [--no-data] | --validate [file]');
  const lock = validate(join(outDir(shortId(commit)), 'engine.lock.json'));
  if (lock.upstream.commit !== commit) fail(`candidate lock is for ${lock.upstream.commit}, not ${commit}`);
  if (!lock.artifacts) fail('candidate lock has no artifacts');
  writeJson(LOCK_PATH, lock);
  log(`wrote ${LOCK_PATH} (${lock.engineId})`);
  if (!flags['no-data']) regenerateData(cloneDir(shortId(commit)));
}
