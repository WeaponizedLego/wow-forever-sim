import { readFileSync } from 'node:fs';
import type { Character } from '@fsim/contracts';
import {
  buildRaidSimRequest,
  characterFromPresets,
  fillFromPreset,
  loadDatabase,
  loadSpecPresets,
  setSpecOption,
  specOptionFields,
  type SpecOptionValue,
} from '@fsim/gamedata';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabases } from './database';
import { createVendorEngineClient, hasVendorEngine } from './node';

// Spec options in the real engine (packages/engine/vendor): an option set on the character reaches the sim and
// changes what it does. Skipped without a local engine, as in CI.

const root = new URL('../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, root)));

describe.skipIf(!hasVendorEngine())('spec options in the engine', () => {
  const client = hasVendorEngine() ? createVendorEngineClient({ concurrency: 4 }) : undefined;
  afterAll(() => client?.dispose());
  const db = loadDatabase(read('fixtures/gamedata/db.bin'), read('fixtures/gamedata/leftover_db.bin'));

  /** Upstream's Survival build, which plays without a pet, with options set by their field key. */
  async function hunter(options: Record<string, SpecOptionValue> = {}) {
    const presets = await loadSpecPresets('hunter');
    let character: Character = fillFromPreset(characterFromPresets(presets, 'sv'), presets);
    for (const [key, value] of Object.entries(options)) {
      const field = specOptionFields('hunter').find((f) => f.key === key)!;
      character = { ...character, specOptions: setSpecOption(character.specOptions, field, value) };
    }
    const req = withDatabases(
      buildRaidSimRequest(character, presets, db, { iterations: 200, seed: 7 }),
      db.raw,
    );
    const res = await client!.raidSim(req);
    expect(res.error).toBeUndefined();
    const player = res.raidMetrics!.parties[0]!.players[0]!;
    return {
      dps: res.raidMetrics!.dps!.avg,
      pets: player.pets.map((p) => ({ name: p.name, dps: p.dps!.avg })),
    };
  }

  it('sims the pet the character names, and none without one', async () => {
    const none = await hunter();
    const cat = await hunter({ 'classOptions.petType': 'Cat' });
    const raptor = await hunter({ 'classOptions.petType': 'Raptor' });
    const absent = await hunter({ 'classOptions.petType': 'Cat', 'classOptions.petUptime': 0 });

    expect(none.pets).toEqual([]);
    // Same seed, same character but for the pet: the pet does damage and the total moves. Which way is upstream's
    // (this build's talents reward having no pet), so only that it moves is asked.
    expect(cat.pets).toHaveLength(1);
    expect(cat.pets[0]!.dps).toBeGreaterThan(0);
    expect(cat.dps).not.toBe(none.dps);
    // Another family is another pet, not the same one under another name.
    expect(raptor.pets).toHaveLength(1);
    expect(raptor.pets[0]!.dps).toBeGreaterThan(0);
    expect(raptor.dps).not.toBe(none.dps);
    expect(raptor.dps).not.toBe(cat.dps);
    // A number option reaches the engine too: a pet that is never out does nothing.
    expect(absent.dps).toBe(none.dps);
  });

  it('reads an option written at its default like one left out', async () => {
    // What the options form writes for "no pet", against upstream's own options, which leave it out.
    const presets = await loadSpecPresets('hunter');
    const sparse = characterFromPresets(presets, 'sv');
    expect(sparse.specOptions.classOptions).not.toHaveProperty('petType');
    const opts = { iterations: 200, seed: 7 };
    const res = await client!.raidSim(withDatabases(buildRaidSimRequest(sparse, presets, db, opts), db.raw));
    expect(res.error).toBeUndefined();
    expect(res.raidMetrics!.dps!.avg).toBe((await hunter({ 'classOptions.petType': 'PetNone' })).dps);
  });
});
