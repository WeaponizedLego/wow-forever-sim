import { readFileSync } from 'node:fs';
import type { Character } from '@fsim/contracts';
import { RaidSimRequest } from '@fsim/proto';
import { describe, expect, it } from 'vitest';
import { characterFromPresets } from './character';
import { loadSpecPresets, presetSetup } from './presets';
import { buildRaidSimRequest, fillFromPreset } from './request';
import { completeSpecOptions, specOptionChanges } from './spec-options';
import { fixtureDb } from './test-db';

const fixture = RaidSimRequest.fromJson(
  JSON.parse(readFileSync(new URL('../../../fixtures/gamedata/sv-request.json', import.meta.url), 'utf8')),
);

/** The parts of a request's protojson these tests read. */
interface RequestJson {
  raid: {
    buffs?: object;
    debuffs?: object;
    parties: { buffs?: object; players?: (Record<string, unknown> & { buffs?: object })[] }[];
  };
}

/** Drops what the engine package or the engine adds: per-player databases and all-zero bonus stats. */
function comparable(req: RaidSimRequest) {
  const json = RaidSimRequest.toJson(RaidSimRequest.clone(req)) as unknown as RequestJson;
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
    const json = (r: RaidSimRequest) => RaidSimRequest.toJson(r) as unknown as RequestJson;
    const full = buildRaidSimRequest(base, presets, fixtureDb(), opts);
    // full raid: raid buffs, debuffs, party buffs and the player's individual buffs
    expect(Object.keys(json(full).raid.buffs ?? {})).not.toHaveLength(0);
    expect(Object.keys(json(full).raid.debuffs ?? {})).not.toHaveLength(0);
    // five-man: party and individual buffs, no raid buffs or debuffs
    expect(json(five).raid.parties[0]!.buffs).toEqual(json(full).raid.parties[0]!.buffs);
    expect(Object.keys(json(five).raid.parties[0]!.players![0]!.buffs ?? {})).not.toHaveLength(0);
    expect(json(five).raid.buffs ?? {}).toEqual({});
    expect(json(five).raid.debuffs ?? {}).toEqual({});
    // none: nothing external
    expect(json(none).raid.parties[0]!.buffs ?? {}).toEqual({});
    expect(json(none).raid.parties[0]!.players![0]!.buffs ?? {}).toEqual({});
  });

  it('builds one target per targetCount and turns execute phase off', async () => {
    const presets = await loadSpecPresets('hunter');
    const c = characterFromPresets(presets, 'sv');
    const req = buildRaidSimRequest(
      { ...c, encounter: { ...c.encounter, style: 'custom', targetCount: 3, executePhase: false } },
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
      { ...c, talents: '', consumables: {}, rotation: { kind: 'preset', presetId: '' } },
      presets,
    );
    expect(filled.talents).toBe(c.talents);
    expect(filled.consumables).toEqual(c.consumables);
    expect(presets.rotations.some((r) => r.id === (filled.rotation as { presetId: string }).presetId)).toBe(
      true,
    );
  });

  // What an importer hands over: talents and gear, no rotation, consumables or spec options.
  const imported = (c: Character): Character => ({
    ...c,
    consumables: {},
    specOptions: {},
    rotation: { kind: 'preset', presetId: '' },
  });
  const rotationId = (c: Character) => (c.rotation as { presetId: string }).presetId;

  it('fills an import from the preset build closest to its talents, not the spec default', async () => {
    const presets = await loadSpecPresets('hunter');
    // Upstream's default hunter is SV Weave; every other build has its own rotation.
    expect(presets.defaults.rotationId).toBe('melee-weave-max');
    for (const build of presets.builds) {
      const filled = fillFromPreset(imported(characterFromPresets(presets, build.id)), presets);
      expect(rotationId(filled), build.id).toBe(build.setup.rotationId);
      expect(filled.consumables, build.id).toEqual(build.setup.consumables);
      // The build's options, every one written out.
      expect(filled.specOptions, build.id).toEqual(completeSpecOptions('hunter', build.setup.specOptions));
      expect(specOptionChanges('hunter', build.setup.specOptions, filled.specOptions).changes).toEqual([]);
    }
    // A Beast Mastery hunter a few points off upstream's build still gets the hawk rotation.
    const bm = characterFromPresets(presets, 'bm');
    const tweaked = { ...imported(bm), talents: '5320001505101251-0053050201-3' };
    expect(rotationId(fillFromPreset(tweaked, presets))).toBe('turret-hawks');
  });

  it('matches by talents where the spec has a rotation called "default"', async () => {
    // "default" is the Shadow rotation's id; a Smite priest must not be left on it.
    const presets = await loadSpecPresets('dps-priest');
    const smite = characterFromPresets(presets, 'smite-testing');
    expect(rotationId(fillFromPreset(imported(smite), presets))).toBe('smite');
    const shadow = characterFromPresets(presets, 'shadow-testing');
    expect(rotationId(fillFromPreset(imported(shadow), presets))).toBe('default');
  });

  it('fills spec options option by option: the character’s own over the preset’s', async () => {
    const presets = await loadSpecPresets('hunter');
    // An import that read only the pet: upstream's SV build has none, and sets ammo, quiver and the pet's speed.
    const sv = characterFromPresets(presets, 'sv');
    const cat = fillFromPreset(
      { ...imported(sv), specOptions: { classOptions: { petType: 'Cat' } } },
      presets,
    );
    expect(cat.specOptions).toEqual({
      classOptions: {
        quiverBonus: 'AncientSinewWrappedLamina',
        ammo: 'ThoriumHeadedArrow',
        petType: 'Cat',
        petUptime: 1,
        cobraReflexes: false,
        petAttackSpeed: 'FasterAttackII',
      },
    });
    const pet = (c: Character) =>
      (c.specOptions as { classOptions: { petType?: string } }).classOptions.petType;
    // The BM build's Raptor fills in for an import without a pet, and gives way to one that says "no pet".
    const bm = imported(characterFromPresets(presets, 'bm'));
    expect(pet(fillFromPreset(bm, presets))).toBe('Raptor');
    expect(
      pet(fillFromPreset({ ...bm, specOptions: { classOptions: { petType: 'PetNone' } } }, presets)),
    ).toBe('PetNone');

    // Options outside classOptions merge the same way.
    const cats = await loadSpecPresets('feral-cat-druid');
    const feral = imported(characterFromPresets(cats));
    expect(
      fillFromPreset({ ...feral, specOptions: { prepullClearcasting: true } }, cats).specOptions,
    ).toEqual({ assumeBleedActive: true, cannotShredTarget: false, prepullClearcasting: true });
  });

  it('changes nothing when a filled character is filled again, whatever build its talents are closest to', async () => {
    const presets = await loadSpecPresets('hunter');
    const sv = fillFromPreset(imported(characterFromPresets(presets, 'sv')), presets);
    expect(fillFromPreset(sv, presets)).toEqual(sv);
    // Retalented to Beast Mastery, whose build has a Raptor: the character still has no pet (a share link or a
    // saved variant is filled again when it is opened, and must sim as it did).
    const retalented = { ...sv, talents: presetSetup(presets, 'bm').talents };
    expect(fillFromPreset(retalented, presets).specOptions).toEqual(sv.specOptions);
  });

  it('sims a stored option the engine no longer has as if it were not there', async () => {
    const presets = await loadSpecPresets('hunter');
    const sv = characterFromPresets(presets, 'sv');
    const stale = {
      ...sv,
      specOptions: {
        classOptions: { ...(sv.specOptions.classOptions as object), petType: 'Sporebat', gone: 1 },
      },
    };
    const opts = { iterations: 10, seed: 1 };
    expect(comparable(buildRaidSimRequest(stale, presets, fixtureDb(), opts))).toEqual(
      comparable(buildRaidSimRequest(sv, presets, fixtureDb(), opts)),
    );
  });

  it('keeps a rotation the character already names, and falls back to the defaults without builds', async () => {
    const hunter = await loadSpecPresets('hunter');
    const bm = characterFromPresets(hunter, 'bm');
    const chosen = { ...bm, rotation: { kind: 'preset' as const, presetId: 'turret' } };
    expect(rotationId(fillFromPreset(chosen, hunter))).toBe('turret');

    const druid = await loadSpecPresets('balance-druid');
    expect(druid.builds).toHaveLength(0);
    const filled = fillFromPreset(imported(characterFromPresets(druid)), druid);
    expect(rotationId(filled)).toBe(druid.defaults.rotationId);
  });
});
