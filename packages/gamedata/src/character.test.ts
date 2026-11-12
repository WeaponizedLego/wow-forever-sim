import { readFileSync } from 'node:fs';
import { Player, RaidSimRequest } from '@fsim/proto';
import { describe, expect, it } from 'vitest';
import { characterFromPresets, characterToPlayer, defaultCharacter } from './character';
import { loadSpecPresets, presetSetup } from './presets';
import { fixtureDb } from './test-db';

const fixturePlayer = () => {
  const json = JSON.parse(
    readFileSync(new URL('../../../fixtures/engine/sv-raidsim-request.json', import.meta.url), 'utf8'),
  );
  return RaidSimRequest.fromJson(json).raid!.parties[0]!.players[0]!;
};

describe('characterToPlayer', () => {
  it('rebuilds the Survival Hunter fixture Player from the "sv" preset build', async () => {
    const presets = await loadSpecPresets('hunter');
    const character = characterFromPresets(presets, 'sv');
    const player = characterToPlayer(character, presets, fixtureDb(), { setup: presetSetup(presets, 'sv') });

    const expected = fixturePlayer();
    // `database` is the engine package's job (lane L2).
    delete expected.database;
    // The engine's request builder (core.SinglePlayerRaidProto) fills an all-zero `bonusStats`; the preset sets none
    // and an absent message reads the same in the engine.
    expect(expected.bonusStats?.stats.every((v) => v === 0)).toBe(true);
    expect(expected.bonusStats?.pseudoStats.every((v) => v === 0)).toBe(true);
    delete expected.bonusStats;

    expect(Player.toJson(player)).toEqual(Player.toJson(expected));
  });

  it('starts every spec from its defaults (or its first simmable build)', async () => {
    const hunter = await defaultCharacter('hunter');
    expect(hunter).toMatchObject({
      class: 'hunter',
      spec: 'hunter',
      race: 'orc',
      level: 60,
      buffs: 'full-raid',
    });
    expect(hunter.rotation).toEqual({ kind: 'preset', presetId: 'melee-weave' });
    expect(hunter.gear.head?.itemId).toBe(16677);
    const warlock = await defaultCharacter('warlock'); // upstream defaults carry no gear; the first build does
    expect(Object.keys(warlock.gear).length).toBe(0);
  });

  it('resolves enchants named by spell or item id and drops ring enchants without Enchanting', async () => {
    const db = fixtureDb();
    const presets = await loadSpecPresets('hunter');
    const character = characterFromPresets(presets, 'sv');
    const chest = db.enchantsByEffectId(1891)[0]!;
    const ring = { effectId: 1891 }; // the data has no ring enchants; any id shows the rule
    character.gear.chest = { ...character.gear.chest!, enchantId: chest.spellId || chest.itemId || 1891 };
    character.gear.finger1 = { ...character.gear.finger1!, enchantId: ring.effectId };
    const items = characterToPlayer(character, presets, db).equipment!.items;
    expect(items[4]!.enchant).toBe(1891);
    expect(items[10]!.enchant).toBe(0);
    character.professions = ['Enchanting'];
    expect(characterToPlayer(character, presets, db).equipment!.items[10]!.enchant).toBe(ring.effectId);
  });

  it('needs a parser for SIML rotations', async () => {
    const presets = await loadSpecPresets('hunter');
    const character = { ...characterFromPresets(presets), rotation: { kind: 'siml' as const, source: 'x' } };
    expect(() => characterToPlayer(character, presets, fixtureDb())).toThrow(/parseSimlRotation/);
  });
});
