// Lane L6: game data. Decodes db.bin, item search, spec presets, Character -> Player, class and quality colors.
export { GameDatabase, loadDatabase, maxScaling, itemLevel } from './database';
export { toImportContext } from './import-context';
export { ItemSearchIndex, requiredLevel, type ItemQuery } from './search';
export { weightStatsFor, type WeightStats } from './weight-stats';
export {
  SOURCE_KINDS,
  RAID_ZONES,
  sourceKind,
  sourceLabel,
  primarySourceLabel,
  type SourceKind,
} from './sources';
export { itemSlots, enchantSlots, enchantAppliesToItem, canEquip, slotId, slotProto } from './slots';
export { CLASS_MAX_ARMOR, CLASS_WEAPON_TYPES, CLASS_RANGED_TYPES, CLASS_RACES } from './classes';
export { SPEC_ONEOF, DUAL_WIELD_SPECS, type SpecOneofKind } from './specs';
export { CLASS_COLORS, ITEM_QUALITY_COLORS, classColorVar, qualityColorVar } from './colors';
export {
  PRESET_INDEX,
  loadSpecPresets,
  presetSetup,
  findRotation,
  findGearSet,
  type SpecPresets,
  type PresetSetup,
  type PresetBuild,
  type PresetGearSet,
  type PresetTalents,
  type PresetRotation,
  type PresetStatus,
  type PresetSummary,
  type PlayerOptions,
} from './presets';
export {
  characterFromPresets,
  defaultCharacter,
  characterToPlayer,
  professionFromName,
  type CharacterToPlayerOptions,
} from './character';
export { buildRaidSimRequest, fillFromPreset, DEFAULT_TARGET_JSON, type SimRequestOptions } from './request';
