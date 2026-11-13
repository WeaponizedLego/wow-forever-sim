// Stand-in for upstream `ui/app/preset_utils.ts`, bundled in its place by extract-presets.ts.
// It keeps the data the upstream helpers produce (same message types, same fields) and drops the UI parts
// (conditions, toasts, i18n). Mirrors upstream at the pinned commit; keep the shapes in step with it.
import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Debuffs, IndividualBuffs, PartyBuffs, RaidBuffs } from '@generated/proto/buffs';
import { ConsumesSpec, EquipmentSpec, ItemSwap } from '@generated/proto/common';
import { IndividualSimSettings, SavedRotation, SavedTalents } from '@generated/proto/ui';

type Json = unknown;
type Obj = Record<string, unknown>;

interface Options {
  group?: string;
  phase?: number;
  devOnly?: boolean;
  [key: string]: unknown;
}

const meta = (options?: Options) => ({
  ...(options?.group !== undefined && { group: options.group }),
  ...(options?.phase !== undefined && { phase: options.phase }),
  ...(options?.devOnly !== undefined && { devOnly: options.devOnly }),
});

export const makePresetGear = (name: string, gearJson: Json, options?: Options) => ({
  __kind: 'gear',
  name,
  gear: EquipmentSpec.fromJson(gearJson as never),
  ...meta(options),
});

export const makePresetTalents = (name: string, data: SavedTalents) => ({ __kind: 'talents', name, data });

export const makePresetEpWeights = (name: string) => ({ __kind: 'epWeights', name });
export const makePresetEpWeightsFromJSON = (json: { name: string }) => ({
  __kind: 'epWeights',
  name: json.name,
});

export const makePresetAPLRotation = (name: string, rotationJson: Json, options?: Options) => ({
  __kind: 'rotation',
  name,
  rotation: SavedRotation.create({ rotation: APLRotation.fromJson(rotationJson as never) }),
  ...meta(options),
});

export const makePresetSimpleRotation = (name: string, spec: number, simpleRotation: unknown) => ({
  __kind: 'rotation',
  name,
  simple: { spec, simpleRotation },
  rotation: SavedRotation.create({
    rotation: APLRotation.create({ type: APLRotationType.TypeSimple }),
  }),
});

export const makePresetEncounter = (
  name: string,
  encounter?: unknown,
  healingModel?: unknown,
  tanks?: unknown,
  targetDummies?: number,
  options?: Options,
) => ({ __kind: 'encounter', name, encounter, healingModel, tanks, targetDummies, ...meta(options) });

export const makePresetItemSwapGear = (name: string, itemSwapJson: Json) => ({
  __kind: 'itemSwap',
  name,
  itemSwap: ItemSwap.fromJson(itemSwapJson as never),
});
export const makePresetItemSwapGearHelper = (name: string, itemSwap: unknown) => ({
  __kind: 'itemSwap',
  name,
  itemSwap,
});

const specOptionsOf = (player: Obj): unknown => {
  const spec = player['spec'] as { oneofKind?: string } & Obj;
  if (!spec?.oneofKind) return undefined;
  return (spec[spec.oneofKind] as Obj | undefined)?.['options'];
};

// Upstream makePresetSettingsHelper.
const settingsFrom = (name: string, s: IndividualSimSettings) => {
  const settings: Obj = { name };
  const p = s.player as unknown as Obj | undefined;
  if (p) {
    if (p['buffs']) settings['buffs'] = p['buffs'];
    if (p['consumables']) settings['consumables'] = p['consumables'];
  }
  if (p && specOptionsOf(p) !== undefined) {
    if (p['race']) settings['race'] = p['race'];
    settings['specOptions'] = specOptionsOf(p);
    const playerOptions: Obj = {
      inFrontOfTarget: p['inFrontOfTarget'],
      distanceFromTarget: p['distanceFromTarget'],
      enableItemSwap: p['enableItemSwap'],
    };
    if (p['reactionTimeMs']) {
      playerOptions['reactionTimeMs'] = p['reactionTimeMs'];
      playerOptions['reactionTimeMaxMs'] = p['reactionTimeMaxMs'];
    }
    if (p['channelClipDelayMs']) playerOptions['channelClipDelayMs'] = p['channelClipDelayMs'];
    if (p['profession1']) playerOptions['profession1'] = p['profession1'];
    if (p['profession2']) playerOptions['profession2'] = p['profession2'];
    settings['playerOptions'] = playerOptions;
  }
  if (p?.['itemSwap']) {
    settings['playerOptions'] = {
      ...(settings['playerOptions'] as Obj | undefined),
      enableItemSwap: p['enableItemSwap'],
      itemSwap: p['itemSwap'],
    };
  }
  if (s.raidBuffs) settings['raidBuffs'] = s.raidBuffs;
  if (s.partyBuffs) settings['partyBuffs'] = s.partyBuffs;
  if (s.debuffs) settings['debuffs'] = s.debuffs;
  return settings;
};

export const makePresetBuild = (name: string, options: Obj) => ({ __kind: 'build', name, ...options });

export const makePresetBuildFromJSON = (name: string, _spec: number, json: Json, buildOptions: Obj = {}) => {
  const { settings: customSettings, ...custom } = buildOptions;
  const s = IndividualSimSettings.fromJson(json as never, { ignoreUnknownFields: true });
  const build: Obj = {};
  const p = s.player;
  if (p) {
    if (p.equipment) build['gear'] = { __kind: 'gear', name, gear: p.equipment };
    if (p.talentsString) {
      build['talents'] = makePresetTalents(name, SavedTalents.create({ talentsString: p.talentsString }));
    }
    if (p.rotation?.type === APLRotationType.TypeAuto) build['rotationType'] = APLRotationType.TypeAuto;
    else if (p.rotation) {
      build['rotation'] = {
        __kind: 'rotation',
        name,
        rotation: SavedRotation.create({ rotation: p.rotation }),
      };
    }
  }
  if (s.encounter) {
    build['encounter'] = makePresetEncounter(name, s.encounter, p?.healingModel, s.tanks, s.targetDummies);
  }
  const settings = settingsFrom(name, s);
  if (Object.keys(settings).length > 1 || customSettings) {
    build['settings'] = { ...settings, ...(customSettings as Obj | undefined) };
  }
  return makePresetBuild(name, { ...build, ...custom });
};

export const makePresetBuildFromSiml = (name: string, spec: number, json: Json, buildOptions?: Obj) => {
  const preset = makePresetBuildFromJSON(name, spec, json, buildOptions) as Obj;
  const settings = preset['settings'] as Obj | undefined;
  const playerOptions = settings?.['playerOptions'] as Obj | undefined;
  if (!playerOptions) return preset;
  const rest = { ...playerOptions };
  delete rest['inFrontOfTarget'];
  delete rest['enableItemSwap'];
  return { ...preset, settings: { ...settings, playerOptions: rest } };
};

// Upstream specDefaultsFromSettings: the spec's defaults from its defaults.siml.
export const specDefaultsFromSettings = (_spec: number, json: Json) => {
  const settings = IndividualSimSettings.fromJson(json as never);
  const player = settings.player!;
  const rotation = player.rotation;
  return {
    gear: player.equipment ?? EquipmentSpec.create(),
    consumables: player.consumables ?? ConsumesSpec.create(),
    talents: SavedTalents.create({ talentsString: player.talentsString }),
    specOptions: specOptionsOf(player as unknown as Obj),
    raidBuffs: settings.raidBuffs ?? RaidBuffs.create(),
    partyBuffs: settings.partyBuffs ?? PartyBuffs.create(),
    individualBuffs: player.buffs ?? IndividualBuffs.create(),
    debuffs: settings.debuffs ?? Debuffs.create(),
    ...(rotation && { rotationType: rotation.type }),
    ...(rotation?.type === APLRotationType.TypeAPL && { aplRotation: rotation }),
    ...(rotation?.type === APLRotationType.TypeSimple && {
      simpleRotation: JSON.parse(rotation.simple?.specRotationJson || '{}'),
    }),
    ...(settings.encounter && {
      encounter: makePresetEncounter(
        'Default',
        settings.encounter,
        undefined,
        undefined,
        settings.targetDummies,
      ),
    }),
    ...(player.enableItemSwap && player.itemSwap && { itemSwap: player.itemSwap }),
    settings,
    other: {
      race: player.race,
      profession1: player.profession1,
      profession2: player.profession2,
      distanceFromTarget: player.distanceFromTarget,
      reactionTime: player.reactionTimeMs,
      reactionTimeMax: player.reactionTimeMaxMs,
      channelClipDelay: player.channelClipDelayMs,
      healingModel: player.healingModel,
      inFrontOfTarget: player.inFrontOfTarget,
    },
  };
};
