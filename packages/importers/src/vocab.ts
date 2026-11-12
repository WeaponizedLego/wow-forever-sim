// Name tables shared by the importers: class, race, spec, profession and slot names as the
// SimC addon, the WoWSims exporter addon and Wowhead spell them, mapped to the contract ids.
import { CLASS_IDS, RACES, RACE_IDS, SPECS } from '@fsim/contracts';
import type { ClassId, ItemSlotId, RaceId, Role, SpecId } from '@fsim/contracts';

/** Lowercase, letters and digits only: "Night Elf", "night_elf", "NightElf" → "nightelf". */
export const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const CLASS_SET = new Set<string>(CLASS_IDS);

/** Classes that exist in modern WoW but not in Forever. Recognised so the error can say so. */
const OTHER_CLASSES = new Set(['deathknight', 'monk', 'demonhunter', 'evoker']);

export function parseClass(name: string): ClassId | undefined {
  const s = squash(name);
  return CLASS_SET.has(s) ? (s as ClassId) : undefined;
}

export const isOtherGameClass = (name: string): boolean => OTHER_CLASSES.has(squash(name));

const RACE_ALIASES: Record<string, RaceId> = {
  scourge: 'undead',
  forsaken: 'undead',
  // SimC (forever branch, engine/util/util.cpp) writes race id 95 as skyborne_alliance and 96 as
  // skyborne_horde. Upstream wowsims (ui/sim/proto/utils.ts) puts High Order on the Alliance side
  // and Windshaper on the Horde side.
  skybornealliance: 'highorderskyborne',
  highorder: 'highorderskyborne',
  skybornehorde: 'windshaperskyborne',
  windshaper: 'windshaperskyborne',
};
const RACE_SET = new Set<string>(RACE_IDS);

export const raceName = (id: RaceId): string => RACES[id].name;

export function parseRace(name: string): RaceId | undefined {
  const s = squash(name);
  if (RACE_SET.has(s)) return s as RaceId;
  return RACE_ALIASES[s];
}

/** Used when an export has no race (or one the engine lacks). Any race the class can be works. */
export const DEFAULT_RACE: Record<ClassId, RaceId> = {
  warrior: 'orc',
  paladin: 'human',
  hunter: 'orc',
  rogue: 'human',
  priest: 'human',
  shaman: 'orc',
  mage: 'human',
  warlock: 'human',
  druid: 'tauren',
};

export const PROFESSIONS = [
  'alchemy',
  'blacksmithing',
  'enchanting',
  'engineering',
  'herbalism',
  'inscription',
  'leatherworking',
  'mining',
  'skinning',
  'tailoring',
] as const;
const PROFESSION_SET = new Set<string>(PROFESSIONS);

export function parseProfession(name: string): string | undefined {
  const s = squash(name);
  return PROFESSION_SET.has(s) ? s : undefined;
}

/**
 * Spec names → engine spec, per class. Covers SimC's retail-style tokens, the WoWSims exporter's
 * Forever spec names (Flavors/Forever/Flavor.lua) and Wowhead's. A `null` means "the class itself",
 * i.e. no spec information (SimC's forever branch only knows class-level specs).
 */
const SPEC_NAMES: Record<ClassId, Record<string, SpecId | null>> = {
  warrior: { arms: 'dps-warrior', fury: 'dps-warrior', protection: 'protection-warrior', warrior: null },
  paladin: {
    holy: 'holy-paladin',
    protection: 'protection-paladin',
    retribution: 'retribution-paladin',
    paladin: null,
  },
  hunter: {
    beastmastery: 'hunter',
    marksmanship: 'hunter',
    marksman: 'hunter',
    survival: 'hunter',
    hunter: null,
  },
  rogue: { assassination: 'rogue', combat: 'rogue', outlaw: 'rogue', subtlety: 'rogue', rogue: null },
  priest: {
    discipline: 'healer-priest',
    holy: 'healer-priest',
    holydisc: 'healer-priest',
    shadow: 'dps-priest',
    priest: null,
  },
  shaman: {
    elemental: 'elemental-shaman',
    enhancement: 'enhancement-shaman',
    restoration: 'restoration-shaman',
    shaman: null,
  },
  mage: { arcane: 'mage', fire: 'mage', frost: 'mage', mage: null },
  warlock: { affliction: 'warlock', demonology: 'warlock', destruction: 'warlock', warlock: null },
  druid: {
    balance: 'balance-druid',
    feral: 'feral-cat-druid',
    feralcat: 'feral-cat-druid',
    cat: 'feral-cat-druid',
    feralbear: 'feral-bear-druid',
    guardian: 'feral-bear-druid',
    bear: 'feral-bear-druid',
    restoration: 'restoration-druid',
    druid: null,
  },
};

/** Words that carry no spec: SimC's Forever export writes `spec=unknown`. */
const NO_SPEC = new Set(['', 'unknown', 'none']);

export type SpecLookup = { kind: 'spec'; spec: SpecId } | { kind: 'none' } | { kind: 'unknown' };

export function lookupSpec(cls: ClassId, name: string, role?: Role): SpecLookup {
  const s = squash(name);
  if (NO_SPEC.has(s)) return { kind: 'none' };
  const table = SPEC_NAMES[cls];
  if (!(s in table)) return { kind: 'unknown' };
  const spec = table[s];
  if (spec === null || spec === undefined) return { kind: 'none' };
  // "feral" names both druid sims; a tank role picks bear.
  if (spec === 'feral-cat-druid' && role === 'tank') return { kind: 'spec', spec: 'feral-bear-druid' };
  return { kind: 'spec', spec };
}

/** SimC role values (`role=attack|spell|tank|heal|hybrid`) plus plain words. */
export function parseRole(value: string): { role: Role; style?: 'melee' | 'caster' } | undefined {
  switch (squash(value)) {
    case 'tank':
      return { role: 'tank' };
    case 'heal':
    case 'healer':
    case 'healing':
      return { role: 'healer' };
    case 'attack':
    case 'melee':
      return { role: 'dps', style: 'melee' };
    case 'spell':
    case 'caster':
      return { role: 'dps', style: 'caster' };
    case 'dps':
    case 'damage':
    case 'hybrid':
      return { role: 'dps' };
    default:
      return undefined;
  }
}

export const specsOfClass = (cls: ClassId) => SPECS.filter((s) => s.class === cls);

const MELEE_FIRST: readonly SpecId[] = ['feral-cat-druid', 'enhancement-shaman'];

/** Spec for a class with no spec in the export: the first engine spec matching the role (dps by default). */
export function defaultSpec(cls: ClassId, hint?: { role: Role; style?: 'melee' | 'caster' }): SpecId {
  const role = hint?.role ?? 'dps';
  const candidates = specsOfClass(cls).filter((s) => s.role === role);
  const pool = candidates.length > 0 ? candidates : specsOfClass(cls);
  if (hint?.style === 'melee') {
    const melee = pool.find((s) => MELEE_FIRST.includes(s.id));
    if (melee) return melee.id;
  }
  return pool[0]!.id;
}

/**
 * Engine spec from the points spent per tree (the tree with the most points wins; the first on a
 * tie). Index is the tree's position in the engine's talent string.
 */
const SPEC_BY_TREE: Record<ClassId, readonly [SpecId, SpecId, SpecId]> = {
  warrior: ['dps-warrior', 'dps-warrior', 'protection-warrior'],
  paladin: ['holy-paladin', 'protection-paladin', 'retribution-paladin'],
  hunter: ['hunter', 'hunter', 'hunter'],
  rogue: ['rogue', 'rogue', 'rogue'],
  priest: ['healer-priest', 'healer-priest', 'dps-priest'],
  shaman: ['elemental-shaman', 'enhancement-shaman', 'restoration-shaman'],
  mage: ['mage', 'mage', 'mage'],
  warlock: ['warlock', 'warlock', 'warlock'],
  druid: ['balance-druid', 'feral-cat-druid', 'restoration-druid'],
};

/** Engine talent string: up to three trees of digits separated by "-", e.g. "30303213002-350530005122100231-1". */
export const ENGINE_TALENTS = /^[0-5]*(?:-[0-5]*){0,2}$/;

export function pointsPerTree(talents: string): [number, number, number] {
  const trees = talents.split('-');
  const sum = (t: string | undefined) => [...(t ?? '')].reduce((a, c) => a + Number(c), 0);
  return [sum(trees[0]), sum(trees[1]), sum(trees[2])];
}

export function specFromTalents(
  cls: ClassId,
  talents: string,
  role?: Role,
): { spec: SpecId; points: [number, number, number] } | undefined {
  const points = pointsPerTree(talents);
  const max = Math.max(...points);
  if (max === 0) return undefined;
  let spec = SPEC_BY_TREE[cls][points.indexOf(max)]!;
  if (spec === 'feral-cat-druid' && role === 'tank') spec = 'feral-bear-druid';
  return { spec, points };
}

export const specName = (id: SpecId): string => SPECS.find((s) => s.id === id)?.name ?? id;

/** SimC slot names (simc-addon extras.lua `simcSlotNames`, plus `ranged` on Forever). */
export const SIMC_SLOTS: Record<string, ItemSlotId> = {
  head: 'head',
  neck: 'neck',
  shoulder: 'shoulder',
  shoulders: 'shoulder',
  back: 'back',
  chest: 'chest',
  wrist: 'wrist',
  wrists: 'wrist',
  hands: 'hands',
  waist: 'waist',
  legs: 'legs',
  feet: 'feet',
  finger1: 'finger1',
  finger2: 'finger2',
  trinket1: 'trinket1',
  trinket2: 'trinket2',
  main_hand: 'mainHand',
  off_hand: 'offHand',
  ranged: 'ranged',
};
/** Slots SimC writes that the engine has no use for. */
export const SIMC_IGNORED_SLOTS = new Set(['shirt', 'tabard', 'ammo']);
