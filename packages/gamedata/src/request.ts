// Builds a complete engine RaidSimRequest for one character, the way upstream's individual sim does
// (cmd/wowsimcli/cmd/sim_request.go individualSimRequest + core.SinglePlayerRaidProto).
// The engine package then attaches each player's SimDatabase (`withDatabases`).
import type { Character } from '@fsim/contracts';
import { Party, Raid, RaidSimRequest, SimOptions, SimType } from '@fsim/proto/api';
import { Encounter, Target } from '@fsim/proto/common';
import { Debuffs, PartyBuffs, RaidBuffs } from '@fsim/proto/buffs';
import { characterToPlayer, type CharacterToPlayerOptions } from './character';
import type { GameDatabase } from './database';
import { presetSetup, type SpecPresets } from './presets';

/**
 * Fills what an import could not provide from the spec's preset defaults: talents, consumables, spec options and
 * the rotation (an importer's `presetId: 'default'`). Values the character already has are kept.
 */
export function fillFromPreset(character: Character, presets: SpecPresets): Character {
  const setup = presetSetup(presets, presets.defaultBuildId);
  const rotation =
    character.rotation.kind === 'preset' &&
    !presets.rotations.some((r) => r.id === (character.rotation as { presetId: string }).presetId)
      ? { kind: 'preset' as const, presetId: setup.rotationId ?? '' }
      : character.rotation;
  return {
    ...character,
    talents: character.talents || setup.talents,
    consumables:
      Object.keys(character.consumables).length > 0
        ? character.consumables
        : structuredClone(setup.consumables),
    specOptions:
      Object.keys(character.specOptions).length > 0
        ? character.specOptions
        : structuredClone(setup.specOptions),
    rotation,
  };
}

export interface SimRequestOptions extends CharacterToPlayerOptions {
  iterations: number;
  /** Required for reproducible runs; 0 makes the engine pick a time-based seed. */
  seed: number;
  /** Every iteration's DPS in the result (histogram, convergence). Default true. */
  saveAllValues?: boolean;
  /** Iteration 1's combat log in the result (timeline). Default true. */
  debugFirstIteration?: boolean;
}

/**
 * Buff presets, from most to least external help:
 * - full-raid: the preset's individual, party and raid buffs and debuffs;
 * - five-man: individual and party buffs only;
 * - solo / none: no external buffs or debuffs (consumables are separate and always apply).
 */
export function buildRaidSimRequest(
  character: Character,
  presets: SpecPresets,
  db: GameDatabase,
  opts: SimRequestOptions,
): RaidSimRequest {
  if (!(opts.iterations >= 1)) throw new Error('iterations must be at least 1');
  const setup = opts.setup ?? presetSetup(presets, presets.defaultBuildId);
  const player = characterToPlayer(character, presets, db, { ...opts, setup });

  const withParty = character.buffs === 'full-raid' || character.buffs === 'five-man';
  const withRaid = character.buffs === 'full-raid';

  const parties: Party[] = [
    Party.create({
      players: [player],
      buffs: withParty ? PartyBuffs.fromJson(setup.partyBuffs as never) : PartyBuffs.create(),
    }),
  ];
  while (parties.length < 5) parties.push(Party.create());

  return RaidSimRequest.create({
    raid: Raid.create({
      parties,
      buffs: withRaid ? RaidBuffs.fromJson(setup.raidBuffs as never) : RaidBuffs.create(),
      debuffs: withRaid ? Debuffs.fromJson(setup.debuffs as never) : Debuffs.create(),
    }),
    encounter: encounterOf(character),
    simOptions: SimOptions.create({
      iterations: opts.iterations,
      randomSeed: opts.seed,
      saveAllValues: opts.saveAllValues ?? true,
      debugFirstIteration: opts.debugFirstIteration ?? true,
    }),
    type: SimType.SimTypeIndividual,
  });
}

/**
 * The site's default raid target (upstream Encounter.defaultTargetProto): a level 63 dragonkin raid boss with
 * 1,428,900 health, 3,731 armor and 54 block value. Copied from a request the engine's own builder produced.
 */
export const DEFAULT_TARGET_JSON = {
  id: 31146,
  name: 'Raid Target',
  level: 63,
  mobType: 'MobTypeDragonkin',
  stats: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 320, 0, 0, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 3731, 0, 1428900, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  minBaseDamage: 2601,
  damageSpread: 0.5,
  swingSpeed: 2,
  parryHaste: true,
  canCrush: true,
} as const;

function encounterOf(character: Character): Encounter {
  const e = character.encounter;
  const targets: Target[] = [];
  for (let i = 0; i < e.targetCount; i++) {
    const t = Target.fromJson(DEFAULT_TARGET_JSON as never);
    t.level = e.targetLevel;
    if (i > 0) t.name = `Raid Target ${i + 1}`;
    targets.push(t);
  }
  return Encounter.create({
    duration: e.durationSec,
    durationVariation: e.durationVariationSec,
    executeProportion20: e.executePhase ? 0.2 : 0,
    executeProportion35: e.executePhase ? 0.35 : 0,
    targets,
  });
}
