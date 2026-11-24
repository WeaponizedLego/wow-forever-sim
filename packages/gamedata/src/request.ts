// Builds a complete engine RaidSimRequest for one character, the way upstream's individual sim does
// (cmd/wowsimcli/cmd/sim_request.go individualSimRequest + core.SinglePlayerRaidProto).
// The engine package then attaches each player's SimDatabase (`withDatabases`).
import type { Character } from '@fsim/contracts';
import { Party, Raid, RaidSimRequest, SimOptions, SimType } from '@fsim/proto/api';
import type { Encounter } from '@fsim/proto/common';
import { Debuffs, PartyBuffs, RaidBuffs } from '@fsim/proto/buffs';
import { characterToPlayer, type CharacterToPlayerOptions } from './character';
import type { GameDatabase } from './database';
import { encounterProto } from './fights';
import { closestSetup, presetSetup, type SpecPresets } from './presets';
import { completeSpecOptions, mergeSpecOptions } from './spec-options';

/**
 * Fills what an import could not provide (talents, consumables, spec options, and the rotation when its preset id
 * names none of the spec's: importers leave it empty) from the preset build closest to the character's talents,
 * so a Beast Mastery hunter gets upstream's BM rotation and not the spec-wide default. Without talents or builds
 * to go by, the spec's defaults are used. Values the character already has are kept.
 *
 * Spec options are filled option by option: the preset's, with the character's own on top, so an import that
 * read only the pet keeps it and takes ammo and quiver from the preset. The result has every option written out
 * (`completeSpecOptions`), which makes a second fill change nothing, whatever build the talents are closest to
 * by then: a shared or saved character sims as it did.
 */
export function fillFromPreset(character: Character, presets: SpecPresets): Character {
  const { setup } = closestSetup(presets, character.talents);
  const hasApl = (id: string | null) => presets.rotations.some((r) => r.id === id && r.kind === 'apl');
  const rotationId = hasApl(setup.rotationId)
    ? setup.rotationId
    : presetSetup(presets, presets.defaultBuildId).rotationId;
  const rotation =
    character.rotation.kind === 'preset' &&
    !presets.rotations.some((r) => r.id === (character.rotation as { presetId: string }).presetId)
      ? { kind: 'preset' as const, presetId: rotationId ?? '' }
      : character.rotation;
  return {
    ...character,
    talents: character.talents || setup.talents,
    consumables:
      Object.keys(character.consumables).length > 0
        ? character.consumables
        : structuredClone(setup.consumables),
    specOptions: completeSpecOptions(
      character.spec,
      mergeSpecOptions(structuredClone(setup.specOptions), character.specOptions),
    ),
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

/** The engine Encounter for the character's fight style (fights.ts). */
function encounterOf(character: Character): Encounter {
  return encounterProto(character.encounter);
}
