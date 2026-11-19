// Typed access to the committed spec presets (data/presets, written by scripts/extract-presets.ts).
import type { Gear, RaceId, Rotation, SpecId } from '@fsim/contracts';
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

/** A build's name with its group where the name alone does not say it ("Fury Pre-BiS", but "Arcane Fire"). */
export const buildLabel = (b: { name: string; group?: string }): string =>
  b.group && !b.name.includes(b.group) ? `${b.group} ${b.name}` : b.name;

/** How far apart two engine talent strings are: the difference in points, summed over every talent. */
export function talentDistance(a: string, b: string): number {
  const x = a.split('-');
  const y = b.split('-');
  let d = 0;
  for (let t = 0; t < Math.max(x.length, y.length); t++) {
    const p = x[t] ?? '';
    const q = y[t] ?? '';
    for (let i = 0; i < Math.max(p.length, q.length); i++)
      d += Math.abs(Number(p[i] ?? 0) - Number(q[i] ?? 0));
  }
  return d;
}

/**
 * The preset build whose talents are closest to `talents` (upstream's first on a tie). Null when the spec has
 * no builds or there are no talents to go by.
 */
export function closestBuild(presets: SpecPresets, talents: string): PresetBuild | null {
  if (!/[1-9]/.test(talents)) return null;
  let best: PresetBuild | null = null;
  let bestDistance = Infinity;
  for (const b of presets.builds) {
    const d = talentDistance(talents, b.setup.talents);
    if (d < bestDistance) [best, bestDistance] = [b, d];
  }
  return best;
}

/**
 * The rotation upstream plays with talents like these: the closest preset build and its APL rotation. Null when
 * no build matches or the build has no rotation to sim.
 */
export function suggestedRotation(
  presets: SpecPresets,
  talents: string,
): { build: PresetBuild; rotation: PresetRotation } | null {
  const build = closestBuild(presets, talents);
  const rotation = build?.setup.rotationId ? findRotation(presets, build.setup.rotationId) : undefined;
  return build && rotation?.kind === 'apl' ? { build, rotation } : null;
}

type ValueVariable = { name?: string; value?: { const?: { val?: string } } };
const variablesOf = (rotation: PresetRotation): ValueVariable[] =>
  rotation.kind === 'apl' ? ((rotation.rotation['valueVariables'] ?? []) as ValueVariable[]) : [];

export interface RotationSwitch {
  name: string;
  on: boolean;
  /** What the rotation has it at before anyone changes it. */
  preset: boolean;
}

/**
 * A rotation's on/off settings: its APL value variables that are a constant true or false ("Use Summon Hawk"),
 * with the character's changed ones (`Rotation.switches`) applied. Empty for a rotation without any.
 */
export function rotationSwitches(
  rotation: PresetRotation,
  changed: Readonly<Record<string, boolean>> = {},
): RotationSwitch[] {
  return variablesOf(rotation).flatMap((v) => {
    const val = v.value?.const?.val;
    if (!v.name || (val !== 'true' && val !== 'false')) return [];
    const preset = val === 'true';
    return [{ name: v.name, on: changed[v.name] ?? preset, preset }];
  });
}

/** The switches that are not at the rotation's own value. */
export const changedSwitches = (
  rotation: PresetRotation,
  changed: Readonly<Record<string, boolean>> = {},
): RotationSwitch[] => rotationSwitches(rotation, changed).filter((s) => s.on !== s.preset);

/**
 * `changed` with one switch set, as `Rotation.switches` stores it: only what differs from the rotation's own
 * values (a switch put back is dropped, as is a name the rotation has no switch for), undefined when nothing does.
 */
export function setRotationSwitch(
  rotation: PresetRotation,
  changed: Readonly<Record<string, boolean>> | undefined,
  name: string,
  on: boolean,
): Record<string, boolean> | undefined {
  const next = changedSwitches(rotation, { ...changed, [name]: on });
  return next.length ? Object.fromEntries(next.map((s) => [s.name, s.on])) : undefined;
}

/** The engine `APLRotation` protojson of a rotation, with the changed switches written into its variables. */
export function rotationApl(
  rotation: PresetRotation & { kind: 'apl' },
  changed: Readonly<Record<string, boolean>> = {},
): JsonObject {
  const set = new Map(changedSwitches(rotation, changed).map((s) => [s.name, s.on]));
  if (!set.size) return rotation.rotation;
  return {
    ...rotation.rotation,
    valueVariables: variablesOf(rotation).map((v) =>
      v.name !== undefined && set.has(v.name)
        ? { ...v, value: { const: { val: String(set.get(v.name)) } } }
        : v,
    ),
  };
}

/**
 * A character's rotation by name, with what was changed in it: "Turret", "Turret · Use Summon Hawk on",
 * "Turret · 3 settings changed", "Custom SIML". The preset id when the presets do not have it (or are not loaded).
 */
export function rotationLabel(rotation: Rotation, presets: SpecPresets | null): string {
  if (rotation.kind === 'siml') return 'Custom SIML';
  const preset = presets && findRotation(presets, rotation.presetId);
  if (!preset) return rotation.presetId;
  const changed = changedSwitches(preset, rotation.switches);
  if (!changed.length) return preset.name;
  return changed.length > 2
    ? `${preset.name} · ${changed.length} settings changed`
    : `${preset.name} · ${changed.map((s) => `${s.name} ${s.on ? 'on' : 'off'}`).join(', ')}`;
}
