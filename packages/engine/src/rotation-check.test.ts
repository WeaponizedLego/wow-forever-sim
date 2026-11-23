import { readFileSync } from 'node:fs';
import type { SpecId } from '@fsim/contracts';
import {
  actionNameSources,
  buildRaidSimRequest,
  buildSpellNames,
  characterFromPresets,
  loadDatabase,
  loadSpecPresets,
  loadSpellNames,
  rotationCheck,
  rotationMessages,
  type RotationCheck,
} from '@fsim/gamedata';
import { ComputeStatsRequest } from '@fsim/proto/api';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabases } from './database';
import { createVendorEngineClient, hasVendorEngine } from './node';

// The rotation check on what the real engine returns (packages/engine/vendor). Skipped without a local engine,
// as in CI. The request is the Workbench's own (`characterSheet(c, true)`): computeStats with the rotation set up.
//
// What a preset rotation asks for, and the engine's wording, are upstream's and move with engine syncs. So this
// holds the check to its shape: the kind a note lands in, a real name where the engine printed an id, and
// nothing lost.

const root = new URL('../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, root)));

/** A raw engine id or unit label, or a name the data did not have ("Spell 27801"). */
const RAW = /\{|\(#\d+\)|\b(Item|Spell|Other action) \d+/;

const shown = (c: RotationCheck) => [
  ...c.neverCast,
  ...c.missing,
  ...c.effects,
  ...c.setup,
  ...c.autocast,
  ...c.other.map((o) => o.text),
];

describe.skipIf(!hasVendorEngine())('rotation check in the engine', () => {
  const client = hasVendorEngine() ? createVendorEngineClient({ concurrency: 1 }) : undefined;
  afterAll(() => client?.dispose());
  const db = loadDatabase(read('fixtures/gamedata/db.bin'), read('fixtures/gamedata/leftover_db.bin'));

  async function check(spec: SpecId, buildId: string) {
    const presets = await loadSpecPresets(spec);
    const character = characterFromPresets(presets, buildId);
    const req = withDatabases(
      buildRaidSimRequest(character, presets, db, { iterations: 1, seed: 1 }),
      db.raw,
    );
    const res = await client!.computeStats(
      ComputeStatsRequest.create({ raid: req.raid!, encounter: req.encounter!, skipRotation: false }),
    );
    const messages = rotationMessages(res.raidStats?.parties[0]?.players[0]?.rotationStats);
    const src = actionNameSources(db, buildSpellNames(db.raw.spellIcons, await loadSpellNames()));
    return { messages, check: rotationCheck(messages, src) };
  }

  it('says which spell the Smite priest never casts, and why', async () => {
    const { messages, check: c } = await check('dps-priest', 'smite-testing');
    // The engine's sentence: the id of a spell that does not reach the target from where the priest stands.
    const raw = messages.find((m) => /never cast/.test(m));
    expect(raw, 'the range sentence').toMatch(/^\{SpellID: \d+\} reaches \d+ yd /);

    expect(c.neverCast).toHaveLength(1);
    // The same sentence with the spell's name where the id was.
    const name = /^(.+?) reaches /.exec(c.neverCast[0]!)?.[1];
    expect(name).toMatch(/^[A-Z][A-Za-z' ]+$/);
    expect(c.neverCast[0]).toBe(raw!.replace(/^\{[^}]*\}/, name!));
    expect(shown(c).filter((s) => RAW.test(s))).toEqual([]);
  });

  it('folds a Rogue preset’s notes into a few lists of names', async () => {
    const { messages, check: c } = await check('rogue', 'combat-ss');
    // Upstream's Rogue rotation covers every build, so it has a note for each talent this one did not take.
    expect(messages.length).toBeGreaterThan(30);
    expect(messages.filter((m) => /does not know/.test(m)).length).toBeGreaterThan(20);
    expect(c.total).toBe(messages.length);

    // What the character does not have: each name once, far fewer than the notes.
    expect(c.missing.length).toBeGreaterThan(3);
    expect(c.missing.length).toBeLessThan(messages.length / 2);
    expect(new Set(c.missing).size).toBe(c.missing.length);
    // An effect of a spell it does not have is not said twice.
    expect(c.effects.filter((e) => c.missing.includes(e))).toEqual([]);

    // Names everywhere: no raw id, no unit label, no "Spell 12345".
    expect(shown(c).filter((s) => RAW.test(s))).toEqual([]);
    // Nothing lost: every note the lists do not cover is in `other`, counted.
    const sorted = messages.filter((m) =>
      /does not know|No aura found|picks no potion|No swap set|will cast the following|never cast/.test(m),
    );
    expect(c.other.reduce((n, o) => n + o.count, 0)).toBe(messages.length - sorted.length);
  });
});
