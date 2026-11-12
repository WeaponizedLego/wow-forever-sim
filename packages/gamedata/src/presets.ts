// Typed access to the committed spec presets (data/presets, written by scripts/extract-presets.ts).
import type { Gear, RaceId, SpecId } from '@fsim/contracts';
import presetIndex from '../data/presets/index.json';

type JsonObject = Record<string, unknown>;

/** Player settings that are not on `Character` (see the lane report: proposed contract addition). */
export interface PlayerOptions {
  distanceFromTarget: number;
  channelClipDelayMs: number;
  reactionTimeMs: number;
  reactionTimeMaxMs: number;
  inFrontOfTarget: boolean;
}

/** A full setup: what upstream's defaults set, or the defaults with one preset build applied. */
export interface PresetSetup {
  race: RaceId;
  /** Engine `Profession` names, e.g. "Engineering". */
  professions: string[];
  talents: string;
  gearSetId: string | null;
  /** Engine `ItemSwap` protojson, when the setup swaps items. */
  itemSwap?: JsonObject;
  /** An APL rotation in `rotations`; null when upstream has none. */
  rotationId: string | null;
  /** Engine `ConsumesSpec` protojson. */
  consumables: JsonObject;
  /** The spec's `options` message as protojson (e.g. `Hunter.options`). */
  specOptions: JsonObject;
  /** Engine `IndividualBuffs`, `PartyBuffs`, `RaidBuffs`, `Debuffs` protojson. */
  individualBuffs: JsonObject;
  partyBuffs: JsonObject;
  raidBuffs: JsonObject;
  debuffs: JsonObject;
  playerOptions: PlayerOptions;
  /** Engine `Encounter` protojson, when the preset sets one. */
  encounter?: JsonObject;
}

export interface PresetBuild {
  id: string;
  name: string;
  group?: string;
  setup: PresetSetup;
}

export interface PresetGearSet {
  id: string;
  name: string;
  group?: string;
  phase?: number;
  /** A gear file in the spec's folder that no upstream preset lists. */
  unlisted?: boolean;
  gear: Gear;
}

export interface PresetTalents {
  id: string;
  name: string;
  talents: string;
}

export type PresetRotation =
  | {
      id: string;
      name: string;
      group?: string;
      kind: 'apl';
      /** Engine `APLRotation` protojson. */ rotation: JsonObject;
    }
  /** Upstream simple rotation: the site builds it into an APL in the browser; not simmable here. */
  | { id: string; name: string; kind: 'simple' };

export type PresetStatus = 'complete' | 'partial' | 'none';

export interface SpecPresets {
  specId: SpecId;
  upstream: { repo: string; commit: string; dir: string; files: string[] };
  status: PresetStatus;
  /** The build `defaultCharacter` starts from when the defaults alone cannot sim; null means the defaults. */
  defaultBuildId: string | null;
  /** What upstream lacks for this spec (see data/presets/README.md). */
  missing: string[];
  notes: string[];
  defaults: PresetSetup;
  builds: PresetBuild[];
  gearSets: PresetGearSet[];
  talents: PresetTalents[];
  rotations: PresetRotation[];
}

export interface PresetSummary {
  specId: SpecId;
  status: PresetStatus;
  defaultBuildId: string | null;
  builds: { id: string; name: string; group?: string }[];
  missing: string[];
}

/** Per-spec status and build names, small enough to load up front (spec picker). */
export const PRESET_INDEX = presetIndex as unknown as { commit: string; specs: PresetSummary[] };

const loaders: Record<SpecId, () => Promise<{ default: unknown }>> = {
  'balance-druid': () => import('../data/presets/balance-druid.json'),
  'feral-cat-druid': () => import('../data/presets/feral-cat-druid.json'),
  'feral-bear-druid': () => import('../data/presets/feral-bear-druid.json'),
  'restoration-druid': () => import('../data/presets/restoration-druid.json'),
  hunter: () => import('../data/presets/hunter.json'),
  mage: () => import('../data/presets/mage.json'),
  'holy-paladin': () => import('../data/presets/holy-paladin.json'),
  'protection-paladin': () => import('../data/presets/protection-paladin.json'),
  'retribution-paladin': () => import('../data/presets/retribution-paladin.json'),
  'dps-priest': () => import('../data/presets/dps-priest.json'),
  'healer-priest': () => import('../data/presets/healer-priest.json'),
  rogue: () => import('../data/presets/rogue.json'),
  'elemental-shaman': () => import('../data/presets/elemental-shaman.json'),
  'enhancement-shaman': () => import('../data/presets/enhancement-shaman.json'),
  'restoration-shaman': () => import('../data/presets/restoration-shaman.json'),
  warlock: () => import('../data/presets/warlock.json'),
  'dps-warrior': () => import('../data/presets/dps-warrior.json'),
  'protection-warrior': () => import('../data/presets/protection-warrior.json'),
};

/** Loads one spec's presets (a separate chunk per spec in the app bundle). */
export async function loadSpecPresets(specId: SpecId): Promise<SpecPresets> {
  return (await loaders[specId]()).default as SpecPresets;
}

/** The setup a build id names, or the defaults when no id is given. Throws on an unknown id. */
export function presetSetup(presets: SpecPresets, buildId?: string | null): PresetSetup {
  if (!buildId) return presets.defaults;
  const build = presets.builds.find((b) => b.id === buildId);
  if (!build) throw new Error(`${presets.specId} has no preset build "${buildId}"`);
  return build.setup;
}

export function findRotation(presets: SpecPresets, id: string): PresetRotation | undefined {
  return presets.rotations.find((r) => r.id === id);
}

export function findGearSet(presets: SpecPresets, id: string): PresetGearSet | undefined {
  return presets.gearSets.find((g) => g.id === id);
}
