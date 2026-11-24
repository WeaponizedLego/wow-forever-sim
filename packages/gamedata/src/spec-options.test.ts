import { SPEC_IDS, type SpecId } from '@fsim/contracts';
import { Player } from '@fsim/proto';
import { HunterOptions_Ammo, HunterOptions_PetType } from '@fsim/proto/hunter';
import { describe, expect, it } from 'vitest';
import { loadSpecPresets } from './presets';
import {
  completeSpecOptions,
  hunterPetTypes,
  mergeSpecOptions,
  optionLabel,
  optionValueLabel,
  setSpecOption,
  specOptionChangeText,
  specOptionChanges,
  specOptionFields,
  specOptionFits,
  specOptionRows,
  specOptionShown,
  specOptionStored,
  specOptionText,
  specOptionValue,
  type SpecOptionEnum,
  type SpecOptionField,
  type SpecOptionNumber,
} from './spec-options';
import { SPEC_ONEOF } from './specs';

const field = (spec: SpecId, key: string): SpecOptionField => {
  const f = specOptionFields(spec).find((x) => x.key === key);
  if (!f) throw new Error(`${spec} has no option ${key}`);
  return f;
};
const enumField = (spec: SpecId, key: string) => field(spec, key) as SpecOptionEnum;
const numberField = (spec: SpecId, key: string) => field(spec, key) as SpecOptionNumber;
/** The names of a generated enum, in the .proto's order. */
const names = (e: object) => Object.keys(e).filter((k) => Number.isNaN(Number(k)));
/** What the engine reads from a spec's options, as canonical protojson (defaults left out). */
const read = (spec: SpecId, options: Record<string, unknown>) =>
  Player.toJson(Player.fromJson({ [SPEC_ONEOF[spec]]: { options } } as never));

const SV = {
  classOptions: {
    quiverBonus: 'AncientSinewWrappedLamina',
    ammo: 'ThoriumHeadedArrow',
    petUptime: 1,
    petAttackSpeed: 'FasterAttackII',
  },
};

describe('labels', () => {
  it('turns a field name into a sentence', () => {
    expect(optionLabel('petAttackSpeed')).toBe('Pet attack speed');
    expect(optionLabel('ammo')).toBe('Ammo');
    expect(optionLabel('earthShieldPPM')).toBe('Earth shield PPM');
    expect(optionLabel('hasBattleShoutRank7')).toBe('Has battle shout rank 7');
    expect(optionLabel('prayer_of_mending_jumps')).toBe('Prayer of mending jumps');
  });

  it('turns an enum value name into a name', () => {
    expect(optionValueLabel('AncientSinewWrappedLamina')).toBe('Ancient Sinew Wrapped Lamina');
    expect(optionValueLabel('BirdOfPrey')).toBe('Bird of Prey');
    expect(optionValueLabel('QuiverOfTheNightWatch')).toBe('Quiver of the Night Watch');
    expect(optionValueLabel('FasterAttackVII')).toBe('Faster Attack VII');
    expect(optionValueLabel('Imp')).toBe('Imp');
  });
});

describe('specOptionFields', () => {
  it('lists a hunter’s options in upstream’s order, classOptions flattened', () => {
    expect(specOptionFields('hunter').map((f) => [f.key, f.kind, f.label])).toEqual([
      ['classOptions.quiverBonus', 'enum', 'Quiver bonus'],
      ['classOptions.ammo', 'enum', 'Ammo'],
      ['classOptions.petType', 'enum', 'Pet type'],
      ['classOptions.petUptime', 'number', 'Pet uptime'],
      ['classOptions.cobraReflexes', 'bool', 'Cobra reflexes'],
      ['classOptions.petAttackSpeed', 'enum', 'Pet attack speed'],
    ]);
    expect(field('hunter', 'classOptions.petType').path).toEqual(['classOptions', 'petType']);
  });

  it('offers every value of the generated enum, the zero value first as None', () => {
    const pet = enumField('hunter', 'classOptions.petType');
    expect(pet.choices.map((c) => c.value)).toEqual(names(HunterOptions_PetType));
    expect(pet.choices[0]).toEqual({ value: 'PetNone', label: 'None' });
    expect(pet.choices.find((c) => c.value === 'WindSerpent')?.label).toBe('Wind Serpent');
    const ammo = enumField('hunter', 'classOptions.ammo');
    expect(ammo.choices.map((c) => c.value)).toEqual(names(HunterOptions_Ammo));
    expect(ammo.choices.slice(0, 3).map((c) => c.label)).toEqual(['None', 'Swiftfeather Arrow', 'Doomshot']);
  });

  it('keeps a zero value that is a real choice under its own name', () => {
    const curse = enumField('warlock', 'classOptions.curseOptions');
    expect(curse.choices.map((c) => c.label)).toEqual(['Elements', 'Recklessness', 'No Curse', 'Weakness']);
    const mode = enumField('healer-priest', 'prayerOfHealingMode');
    expect(mode.choices.map((c) => c.label)).toEqual(['Full Party', 'Dynamic']);
  });

  it('drops the enum’s own name from its values, and uses the hand-written labels', () => {
    const stance = enumField('dps-warrior', 'classOptions.defaultStance');
    expect(stance.choices.map((c) => c.label)).toEqual([
      'None',
      'Battle',
      'Defensive',
      'Berserker',
      'Gladiator',
    ]);
    const armor = enumField('mage', 'classOptions.defaultMageArmor');
    expect(armor.choices.map((c) => c.label)).toEqual(['None', 'Mage Armor', 'Ice Armor']);
    expect(field('enhancement-shaman', 'classOptions.imbueMh').label).toBe('Main-hand imbue');
    const families = enumField('hunter', 'classOptions.petType').choices;
    expect(families.find((c) => c.value === 'Crocilisk')?.label).toBe('Crocolisk');
  });

  it('mixes a spec’s own options with its class options, and tells whole numbers from decimals', () => {
    const priest = specOptionFields('healer-priest');
    expect(priest.map((f) => f.key)).toEqual([
      'classOptions.armor',
      'classOptions.useShadowfiend',
      'classOptions.preShadowform',
      'prayerOfHealingMode',
      'prayerOfMendingJumps',
      'prayerOfMendingDelay',
      'holyNovaHealTargets',
    ]);
    expect(numberField('healer-priest', 'prayerOfMendingJumps').integer).toBe(true);
    expect(numberField('healer-priest', 'prayerOfMendingDelay').integer).toBe(false);
  });

  it('leaves out references to other raid members, and is empty for a spec without options', () => {
    // Druids only have an Innervate target, the Shadow Priest also a Power Infusion target.
    expect(specOptionFields('balance-druid')).toEqual([]);
    expect(specOptionFields('dps-priest').map((f) => f.key)).not.toContain('powerInfusionTarget.type');
    expect(specOptionFields('rogue')).toEqual([]);
  });

  it('has a field for every option upstream’s presets set, and reads each preset’s value', async () => {
    for (const spec of SPEC_IDS) {
      const presets = await loadSpecPresets(spec);
      const fields = specOptionFields(spec);
      expect(new Set(fields.map((f) => f.key)).size, spec).toBe(fields.length);
      for (const setup of [presets.defaults, ...presets.builds.map((b) => b.setup)]) {
        // Nothing a preset sets is left without a control.
        expect(specOptionChanges(spec, {}, setup.specOptions).rest, spec).toBe(false);
        for (const f of fields) {
          const v = specOptionValue(setup.specOptions, f);
          if (f.kind === 'enum') expect(f.choices.map((c) => c.value)).toContain(v);
          if (f.kind === 'number') expect(specOptionFits(f, v), `${spec} ${f.key}`).toBe(true);
        }
      }
    }
  });
});

describe('values', () => {
  const pet = field('hunter', 'classOptions.petType');
  const uptime = numberField('hunter', 'classOptions.petUptime');
  const cobra = field('hunter', 'classOptions.cobraReflexes');
  const shards = numberField('warlock', 'classOptions.soulShards');

  it('reads an option that is not written as the engine’s default', () => {
    expect(specOptionValue(SV, pet)).toBe('PetNone');
    expect(specOptionValue(SV, cobra)).toBe(false);
    expect(specOptionValue({}, uptime)).toBe(0);
    expect(specOptionValue(SV, uptime)).toBe(1);
    expect(specOptionValue(SV, field('hunter', 'classOptions.ammo'))).toBe('ThoriumHeadedArrow');
  });

  it('reads the other forms protojson allows, and a value the engine does not have as the default', () => {
    expect(specOptionValue({ classOptions: { petType: 6 } }, pet)).toBe('Cat');
    expect(specOptionValue({ classOptions: { petUptime: '0.5' } }, uptime)).toBe(0.5);
    expect(specOptionValue({ classOptions: { petType: 'Sporebat' } }, pet)).toBe('PetNone');
    expect(specOptionValue({ classOptions: { petUptime: 'lots' } }, uptime)).toBe(0);
    expect(specOptionValue({ classOptions: 'x' }, pet)).toBe('PetNone');
  });

  it('shows a value as text', () => {
    expect(specOptionText(pet, 'Raptor')).toBe('Raptor');
    expect(specOptionText(pet, 'PetNone')).toBe('None');
    expect(specOptionText(cobra, true)).toBe('on');
    expect(specOptionText(cobra, false)).toBe('off');
    expect(specOptionText(uptime, 0.8)).toBe('80%');
    expect(specOptionText(shards, 32)).toBe('32');
  });

  it('keeps a fraction as the engine reads it and shows it as a percentage', () => {
    expect(uptime.unit).toBe('%');
    expect(specOptionShown(uptime, 0.8)).toBe(80);
    expect(specOptionStored(uptime, 80)).toBe(0.8);
    expect(specOptionShown(shards, 32)).toBe(32);
    expect(specOptionFits(uptime, 1)).toBe(true);
    expect(specOptionFits(uptime, 1.2)).toBe(false);
    expect(specOptionFits(uptime, -0.1)).toBe(false);
    // A whole number where the engine reads an integer: a fraction there would fail the request.
    expect(specOptionFits(shards, 3)).toBe(true);
    expect(specOptionFits(shards, 2.5)).toBe(false);
    expect(specOptionFits(shards, Number.NaN)).toBe(false);
  });

  it('sets an option without touching the others or the original, also when it is the default', () => {
    const cat = setSpecOption(SV, pet, 'Cat');
    expect(cat).toEqual({ classOptions: { ...SV.classOptions, petType: 'Cat' } });
    expect(SV.classOptions).not.toHaveProperty('petType');
    // "No pet" is written, not left out: a missing option is one the preset fills in.
    expect(setSpecOption(cat, pet, 'PetNone')).toEqual({
      classOptions: { ...SV.classOptions, petType: 'PetNone' },
    });
    expect(setSpecOption({}, cobra, true)).toEqual({ classOptions: { cobraReflexes: true } });
    expect(setSpecOption({ assumeBleedActive: true }, field('feral-bear-druid', 'startingRage'), 40)).toEqual(
      { assumeBleedActive: true, startingRage: 40 },
    );
  });
});

describe('completeSpecOptions', () => {
  it('writes every option out and changes nothing the second time', () => {
    const full = completeSpecOptions('hunter', SV);
    expect(full).toEqual({
      classOptions: { ...SV.classOptions, petType: 'PetNone', cobraReflexes: false },
    });
    expect(completeSpecOptions('hunter', full)).toEqual(full);
    expect(SV.classOptions).not.toHaveProperty('petType');
  });

  it('keeps what it has no field for', () => {
    expect(completeSpecOptions('balance-druid', { classOptions: { innervateTarget: {} } })).toEqual({
      classOptions: { innervateTarget: {} },
    });
    expect(completeSpecOptions('rogue', { classOptions: {} })).toEqual({ classOptions: {} });
  });

  it('is the same options to the engine, for every preset of every spec', async () => {
    for (const spec of SPEC_IDS) {
      const presets = await loadSpecPresets(spec);
      for (const setup of [presets.defaults, ...presets.builds.map((b) => b.setup)]) {
        const full = completeSpecOptions(spec, setup.specOptions);
        expect(read(spec, full), spec).toEqual(read(spec, setup.specOptions));
        expect(specOptionChanges(spec, setup.specOptions, full), spec).toEqual({ changes: [], rest: false });
      }
    }
  });
});

describe('mergeSpecOptions', () => {
  it('lays the character’s options over the preset’s, inside classOptions too', () => {
    const base = { classOptions: { ammo: 'Doomshot', petType: 'Raptor', petUptime: 1 }, other: 1 };
    const over = { classOptions: { petType: 'Cat' }, own: true };
    expect(mergeSpecOptions(base, over)).toEqual({
      classOptions: { ammo: 'Doomshot', petType: 'Cat', petUptime: 1 },
      other: 1,
      own: true,
    });
    expect(base.classOptions.petType).toBe('Raptor');
    expect(mergeSpecOptions(SV, {})).toEqual(SV);
    expect(mergeSpecOptions({}, SV)).toEqual(SV);
  });
});

describe('specOptionChanges', () => {
  const texts = (a: Record<string, unknown>, b: Record<string, unknown>, spec: SpecId = 'hunter') =>
    specOptionChanges(spec, a, b).changes.map(specOptionChangeText);

  it('finds no change between the same options written out and not', () => {
    expect(specOptionChanges('hunter', SV, completeSpecOptions('hunter', SV))).toEqual({
      changes: [],
      rest: false,
    });
    expect(specOptionChanges('hunter', {}, { classOptions: {} }).rest).toBe(false);
    const reordered = { classOptions: Object.fromEntries(Object.entries(SV.classOptions).reverse()) };
    expect(specOptionChanges('hunter', SV, reordered)).toEqual({ changes: [], rest: false });
  });

  it('names each option that differs, with what it was and is', () => {
    const cat = { classOptions: { ...SV.classOptions, petType: 'Cat', petUptime: 0.8, cobraReflexes: true } };
    expect(texts(SV, cat)).toEqual(['Pet type: None → Cat', 'Pet uptime: 100% → 80%', 'Cobra reflexes: on']);
    expect(texts(cat, SV)).toEqual(['Pet type: Cat → None', 'Pet uptime: 80% → 100%', 'Cobra reflexes: off']);
    expect(
      texts({ classOptions: { summon: 'Imp' } }, { classOptions: { summon: 'Succubus' } }, 'warlock'),
    ).toEqual(['Summon: Imp → Succubus']);
  });

  it('says so when something without a field differs', () => {
    const a = { classOptions: { innervateTarget: {} } };
    const b = { classOptions: { innervateTarget: { type: 'Player', index: 2 } } };
    expect(specOptionChanges('balance-druid', a, b)).toEqual({ changes: [], rest: true });
    // An empty reference is no reference.
    expect(specOptionChanges('balance-druid', a, {}).rest).toBe(false);
    expect(specOptionChanges('hunter', SV, { ...SV, fromANewerEngine: 1 }).rest).toBe(true);
  });
});

describe('specOptionRows', () => {
  it('sets each option next to the value of the preset build closest to the talents', async () => {
    const presets = await loadSpecPresets('hunter');
    const sv = presets.builds.find((b) => b.id === 'sv')!;
    const cat = { classOptions: { ...SV.classOptions, petType: 'Cat' } };
    const { build, rows } = specOptionRows(
      { spec: 'hunter', talents: sv.setup.talents, specOptions: cat },
      presets,
    );
    expect(build?.id).toBe('sv');
    const differing = rows.filter((r) => r.value !== r.preset);
    expect(differing.map((r) => [r.field.label, r.value, r.preset])).toEqual([
      ['Pet type', 'Cat', 'PetNone'],
    ]);
    // Beast Mastery talents: upstream's BM build has a Raptor, so there the Cat is the difference.
    const bm = presets.builds.find((b) => b.id === 'bm')!;
    const onBm = specOptionRows({ spec: 'hunter', talents: bm.setup.talents, specOptions: cat }, presets);
    expect(onBm.build?.id).toBe('bm');
    expect(onBm.rows.filter((r) => r.value !== r.preset).map((r) => r.preset)).toEqual(['Raptor']);
  });

  it('compares with the spec’s own setup where it has no builds', async () => {
    const presets = await loadSpecPresets('feral-cat-druid');
    const { build, rows } = specOptionRows(
      { spec: 'feral-cat-druid', talents: presets.defaults.talents, specOptions: {} },
      presets,
    );
    expect(build).toBeNull();
    expect(rows.filter((r) => r.value !== r.preset).map((r) => r.field.label)).toEqual([
      'Assume bleed active',
    ]);
  });
});

describe('hunterPetTypes', () => {
  it('lists the engine’s pet families without the value for no pet', () => {
    const families = hunterPetTypes();
    expect(families).toEqual(names(HunterOptions_PetType).slice(1));
    expect(families).toContain('Cat');
    expect(families).not.toContain('PetNone');
  });
});
