import { readFileSync } from 'node:fs';
import { RaidSimRequest } from '@fsim/proto';
import { describe, expect, it } from 'vitest';
import { characterFromPresets } from './character';
import { loadSpecPresets, presetSetup } from './presets';
import { buildRaidSimRequest, fillFromPreset } from './request';
import { fixtureDb } from './test-db';

const fixture = RaidSimRequest.fromJson(
  JSON.parse(
    readFileSync(new URL('../../../fixtures/engine/sv-raidsim-request.json', import.meta.url), 'utf8'),
  ),
);

/** Drops what the engine package or the engine adds: per-player databases and all-zero bonus stats. */
function comparable(req: RaidSimRequest) {
  const json = RaidSimRequest.toJson(RaidSimRequest.clone(req)) as Record<string, any>;
  for (const party of json.raid.parties ?? [])
    for (const p of party.players ?? []) {
      delete p.database;
      delete p.bonusStats;
    }
  return json;
}

describe('buildRaidSimRequest', () => {
  it('rebuilds the engine-built Survival Hunter request from the "sv" preset', async () => {
    const presets = await loadSpecPresets('hunter');
    const character = characterFromPresets(presets, 'sv');
    const req = buildRaidSimRequest(character, presets, fixtureDb(), {
      iterations: 5000,
      seed: Number(fixture.simOptions!.randomSeed),
      setup: presetSetup(presets, 'sv'),
    });
    expect(comparable(req)).toEqual(comparable(fixture));
  });

  it('scales buffs with the buffs preset', async () => {
    const presets = await loadSpecPresets('hunter');
    const base = characterFromPresets(presets, 'sv');
    const opts = { iterations: 10, seed: 1 };
    const none = buildRaidSimRequest({ ...base, buffs: 'none' }, presets, fixtureDb(), opts);
    const five = buildRaidSimRequest({ ...base, buffs: 'five-man' }, presets, fixtureDb(), opts);
    const json = (r: RaidSimRequest) => RaidSimRequest.toJson(r) as any;
    const full = buildRaidSimRequest(base, presets, fixtureDb(), opts);
    // full raid: raid buffs, debuffs, party buffs and the player's individual buffs
    expect(Object.keys(json(full).raid.buffs ?? {})).not.toHaveLength(0);
    expect(Object.keys(json(full).raid.debuffs ?? {})).not.toHaveLength(0);
    // five-man: party and individual buffs, no raid buffs or debuffs
    expect(json(five).raid.parties[0].buffs).toEqual(json(full).raid.parties[0].buffs);
    expect(Object.keys(json(five).raid.parties[0].players[0].buffs ?? {})).not.toHaveLength(0);
    expect(json(five).raid.buffs ?? {}).toEqual({});
    expect(json(five).raid.debuffs ?? {}).toEqual({});
    // none: nothing external
    expect(json(none).raid.parties[0].buffs ?? {}).toEqual({});
    expect(json(none).raid.parties[0].players[0].buffs ?? {}).toEqual({});
  });

  it('builds one target per targetCount and turns execute phase off', async () => {
    const presets = await loadSpecPresets('hunter');
    const c = characterFromPresets(presets, 'sv');
    const req = buildRaidSimRequest(
      { ...c, encounter: { ...c.encounter, targetCount: 3, executePhase: false } },
      presets,
      fixtureDb(),
      { iterations: 10, seed: 1 },
    );
    expect(req.encounter!.targets).toHaveLength(3);
    expect(req.encounter!.executeProportion20).toBe(0);
  });

  it('fills empty talents, consumables and an unknown rotation from the preset', async () => {
    const presets = await loadSpecPresets('elemental-shaman');
    const c = characterFromPresets(presets);
    const filled = fillFromPreset(
      { ...c, talents: '', consumables: {}, rotation: { kind: 'preset', presetId: 'default' } },
      presets,
    );
    expect(filled.talents).toBe(c.talents);
    expect(filled.consumables).toEqual(c.consumables);
    expect(presets.rotations.some((r) => r.id === (filled.rotation as { presetId: string }).presetId)).toBe(
      true,
    );
  });
});
