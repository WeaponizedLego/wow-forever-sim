// Character (the app's engine-agnostic description) <-> engine Player proto, and characters from spec presets.
import {
  CLASSES,
  CharacterSchema,
  ITEM_SLOTS,
  MAX_LEVEL,
  RACES,
  SPECS,
  type Character,
  type Encounter as CharacterEncounter,
  type SpecId,
} from '@fsim/contracts';
import { Player } from '@fsim/proto/api';
import { APLRotation } from '@fsim/proto/apl';
import { IndividualBuffs } from '@fsim/proto/buffs';
import {
  ConsumesSpec,
  EquipmentSpec,
  ItemSlot,
  Profession,
  type Class,
  type Race,
  type ItemSpec,
} from '@fsim/proto/common';
import type { GameDatabase } from './database';
import {
  findGearSet,
  findRotation,
  loadSpecPresets,
  presetSetup,
  type PlayerOptions,
  type PresetSetup,
  type SpecPresets,
} from './presets';
import { SPEC_ONEOF } from './specs';

const specInfo = (id: SpecId) => SPECS.find((s) => s.id === id)!;

/** Engine Profession for a name ("Engineering", "engineering"); Unknown when it names none. */
export function professionFromName(name: string | undefined): Profession {
  if (!name) return Profession.ProfessionUnknown;
  const key = Object.keys(Profession).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (Profession[key as keyof typeof Profession] as Profession) : Profession.ProfessionUnknown;
}

function encounterFrom(json: Record<string, unknown> | undefined): CharacterEncounter | undefined {
  if (!json) return undefined;
  const targets = (json['targets'] as { level?: number }[] | undefined) ?? [];
  return {
    durationSec: (json['duration'] as number | undefined) ?? 180,
    durationVariationSec: (json['durationVariation'] as number | undefined) ?? 0,
    targetCount: Math.min(5, Math.max(1, targets.length || 1)),
    targetLevel: targets[0]?.level ?? MAX_LEVEL + 3,
    executePhase: true,
  };
}

/** A character from a spec's presets: its defaults, or one of its builds resolved over them. */
export function characterFromPresets(presets: SpecPresets, buildId?: string | null): Character {
  const setup = presetSetup(presets, buildId);
  const spec = specInfo(presets.specId);
  const gearSet = setup.gearSetId ? findGearSet(presets, setup.gearSetId) : undefined;
  const encounter = encounterFrom(setup.encounter);
  return CharacterSchema.parse({
    class: spec.class,
    spec: spec.id,
    race: setup.race,
    level: MAX_LEVEL,
    gear: structuredClone(gearSet?.gear ?? {}),
    talents: setup.talents,
    professions: setup.professions.slice(0, 2),
    consumables: structuredClone(setup.consumables),
    specOptions: structuredClone(setup.specOptions),
    buffs: 'full-raid',
    rotation: { kind: 'preset', presetId: setup.rotationId ?? '' },
    ...(encounter ? { encounter } : {}),
  });
}

/**
 * The starting character for a spec: upstream's defaults, or, when those cannot sim (no gear, say), the preset
 * build upstream lists first that can (`SpecPresets.defaultBuildId`). Pass a build id to start from that build.
 */
export async function defaultCharacter(specId: SpecId, buildId?: string): Promise<Character> {
  const presets = await loadSpecPresets(specId);
  return characterFromPresets(presets, buildId ?? presets.defaultBuildId);
}

export interface CharacterToPlayerOptions {
  /** Player settings `Character` cannot carry yet; default: the spec's preset defaults. */
  playerOptions?: Partial<PlayerOptions>;
  /** The preset setup the individual buffs come from; default: the spec's preset defaults. */
  setup?: PresetSetup;
  /** Turns `{ kind: 'siml' }` rotation source into an APLRotation (the engine's `simlParse`). */
  parseSimlRotation?: (source: string) => APLRotation;
}

/**
 * The engine Player for a character, without `database` (the engine package attaches the SimDatabase subset).
 * Enchant ids are resolved to effect ids through `db` (imports may name an enchant by its item or spell id).
 * Ring enchants are dropped without Enchanting, as upstream's request builder does.
 */
export function characterToPlayer(
  character: Character,
  presets: SpecPresets,
  db: GameDatabase,
  options: CharacterToPlayerOptions = {},
): Player {
  if (presets.specId !== character.spec) {
    throw new Error(`presets are for ${presets.specId}, the character is ${character.spec}`);
  }
  const setup = options.setup ?? presets.defaults;
  // Precedence: spec preset < character < explicit option.
  const playerOptions = {
    ...presets.defaults.playerOptions,
    ...definedOnly(character.playerOptions),
    ...definedOnly(options.playerOptions ?? {}),
  };
  const [prof1, prof2] = character.professions.map(professionFromName);
  const enchanting = prof1 === Profession.Enchanting || prof2 === Profession.Enchanting;

  const items: ItemSpec[] = ITEM_SLOTS.map((slot, i) => {
    const g = character.gear[slot];
    if (!g) return { id: 0, randomSuffix: 0, enchant: 0 };
    const item = db.item(g.itemId);
    let enchant = 0;
    if (g.enchantId) enchant = db.findEnchant(g.enchantId, item)?.effectId ?? g.enchantId;
    if (!enchanting && (i === ItemSlot.ItemSlotFinger1 || i === ItemSlot.ItemSlotFinger2)) enchant = 0;
    return { id: g.itemId, randomSuffix: g.randomSuffix ?? 0, enchant };
  });

  const kind = SPEC_ONEOF[character.spec];
  const { spec } = Player.fromJson({ [kind]: { options: character.specOptions } } as never);

  return Player.create({
    name: character.name ?? '',
    race: RACES[character.race].proto as Race,
    class: CLASSES[character.class].proto as Class,
    equipment: EquipmentSpec.create({ items }),
    consumables: ConsumesSpec.fromJson(character.consumables as never),
    buffs:
      character.buffs === 'full-raid' || character.buffs === 'five-man'
        ? IndividualBuffs.fromJson(setup.individualBuffs as never)
        : IndividualBuffs.create(),
    spec,
    talentsString: character.talents,
    profession1: prof1 ?? Profession.ProfessionUnknown,
    profession2: prof2 ?? Profession.ProfessionUnknown,
    rotation: rotationOf(character, presets, options),
    reactionTimeMs: playerOptions.reactionTimeMs,
    reactionTimeMaxMs: playerOptions.reactionTimeMaxMs,
    channelClipDelayMs: playerOptions.channelClipDelayMs,
    inFrontOfTarget: playerOptions.inFrontOfTarget,
    distanceFromTarget: playerOptions.distanceFromTarget,
  });
}

function rotationOf(
  character: Character,
  presets: SpecPresets,
  options: CharacterToPlayerOptions,
): APLRotation {
  const r = character.rotation;
  if (r.kind === 'siml') {
    if (!options.parseSimlRotation) throw new Error('a SIML rotation needs options.parseSimlRotation');
    return options.parseSimlRotation(r.source);
  }
  const preset = findRotation(presets, r.presetId);
  if (!preset) throw new Error(`${presets.specId} has no rotation preset "${r.presetId}"`);
  if (preset.kind !== 'apl') {
    throw new Error(
      `rotation preset "${r.presetId}" is an upstream simple rotation, which has no APL to sim`,
    );
  }
  return APLRotation.fromJson(preset.rotation as never);
}

/** Drops keys whose value is undefined, so spreading an override never erases a default. */
function definedOnly<T extends object>(o: T): Partial<{ [K in keyof T]: Exclude<T[K], undefined> }> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<{
    [K in keyof T]: Exclude<T[K], undefined>;
  }>;
}
