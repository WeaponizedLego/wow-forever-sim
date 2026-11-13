import { readFileSync } from 'node:fs';
import {
  buildRaidSimRequest,
  fillFromPreset,
  loadDatabase,
  loadSpecPresets,
  toImportContext,
} from '@fsim/gamedata';
import { importAny } from '@fsim/importers';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabases } from './database';
import { createVendorEngineClient, hasVendorEngine } from './node';

const root = new URL('../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, root)));

// End to end with a real WoW Forever SimC export: import → fill from preset → request → per-player
// database → sim in the real engine (packages/engine/vendor, see scripts/build-local.mjs).
describe.skipIf(!hasVendorEngine())('end to end: real SimC export through the engine', () => {
  const client = hasVendorEngine() ? createVendorEngineClient({ concurrency: 4 }) : undefined;
  afterAll(() => client?.dispose());

  it('sims the level 42 shaman export', async () => {
    const db = loadDatabase(read('fixtures/gamedata/db.bin'), read('fixtures/gamedata/leftover_db.bin'));
    const input = readFileSync(new URL('fixtures/import/real/simc-shaman-lvl42.simc', root), 'utf8');
    const imported = importAny(input, toImportContext(db, 'fixture'));
    expect(imported.character).not.toBeNull();

    const presets = await loadSpecPresets(imported.character!.spec);
    const character = fillFromPreset(imported.character!, presets);
    const req = withDatabases(
      buildRaidSimRequest(character, presets, db, { iterations: 1000, seed: 42 }),
      db.raw,
    );

    const res = await client!.raidSim(req);
    expect(res.error).toBeUndefined();
    const dps = res.raidMetrics!.dps!;
    console.info(
      `${character.spec} (imported at level ${imported.character!.level}): ${dps.avg.toFixed(1)} DPS, σ ${dps.stdev.toFixed(1)}, ${res.iterationsDone} iterations`,
    );
    expect(dps.avg).toBeGreaterThan(50);
    expect(dps.allValues).toHaveLength(1000);
  });
});
