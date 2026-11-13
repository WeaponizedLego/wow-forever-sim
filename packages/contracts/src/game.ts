// Game vocabulary, mirrored from the engine's common.proto (pinned commit in engine.lock.json).
// Numbers are the engine's enum values so conversion to protos is a lookup, not a guess.

export const CLASSES = {
  warrior: { proto: 1, name: 'Warrior' },
  paladin: { proto: 2, name: 'Paladin' },
  hunter: { proto: 3, name: 'Hunter' },
  rogue: { proto: 4, name: 'Rogue' },
  priest: { proto: 5, name: 'Priest' },
  shaman: { proto: 7, name: 'Shaman' },
  mage: { proto: 8, name: 'Mage' },
  warlock: { proto: 9, name: 'Warlock' },
  druid: { proto: 11, name: 'Druid' },
} as const;
export type ClassId = keyof typeof CLASSES;
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export const RACES = {
  bloodelf: { proto: 1, name: 'Blood Elf' },
  dwarf: { proto: 2, name: 'Dwarf' },
  gnome: { proto: 3, name: 'Gnome' },
  human: { proto: 4, name: 'Human' },
  nightelf: { proto: 5, name: 'Night Elf' },
  orc: { proto: 6, name: 'Orc' },
  tauren: { proto: 7, name: 'Tauren' },
  troll: { proto: 8, name: 'Troll' },
  undead: { proto: 9, name: 'Undead' },
  highorderskyborne: { proto: 10, name: 'High Order Skyborne' },
  windshaperskyborne: { proto: 11, name: 'Windshaper Skyborne' },
} as const;
export type RaceId = keyof typeof RACES;
export const RACE_IDS = Object.keys(RACES) as RaceId[];

export type Role = 'dps' | 'tank' | 'healer';

/**
 * Engine specs. These are simulation specs, not talent trees: "DPS Warrior" covers Arms and Fury,
 * "Hunter" covers every hunter build. Talent builds are presets on top (see `Character.talents`).
 * `upstreamDir` is the folder under the engine's ui/specs/ that holds the spec's presets.
 */
export const SPECS = [
  {
    id: 'balance-druid',
    proto: 1,
    class: 'druid',
    name: 'Balance Druid',
    role: 'dps',
    upstreamDir: 'druid/balance',
  },
  {
    id: 'feral-cat-druid',
    proto: 2,
    class: 'druid',
    name: 'Feral Druid (Cat)',
    role: 'dps',
    upstreamDir: 'druid/feralcat',
  },
  {
    id: 'feral-bear-druid',
    proto: 3,
    class: 'druid',
    name: 'Feral Druid (Bear)',
    role: 'tank',
    upstreamDir: 'druid/feralbear',
  },
  {
    id: 'restoration-druid',
    proto: 4,
    class: 'druid',
    name: 'Restoration Druid',
    role: 'healer',
    upstreamDir: 'druid/restoration',
  },
  { id: 'hunter', proto: 5, class: 'hunter', name: 'Hunter', role: 'dps', upstreamDir: 'hunter/dps' },
  { id: 'mage', proto: 6, class: 'mage', name: 'Mage', role: 'dps', upstreamDir: 'mage/dps' },
  {
    id: 'holy-paladin',
    proto: 7,
    class: 'paladin',
    name: 'Holy Paladin',
    role: 'healer',
    upstreamDir: 'paladin/holy',
  },
  {
    id: 'protection-paladin',
    proto: 8,
    class: 'paladin',
    name: 'Protection Paladin',
    role: 'tank',
    upstreamDir: 'paladin/protection',
  },
  {
    id: 'retribution-paladin',
    proto: 9,
    class: 'paladin',
    name: 'Retribution Paladin',
    role: 'dps',
    upstreamDir: 'paladin/retribution',
  },
  {
    id: 'dps-priest',
    proto: 10,
    class: 'priest',
    name: 'Shadow Priest',
    role: 'dps',
    upstreamDir: 'priest/dps',
  },
  {
    id: 'healer-priest',
    proto: 18,
    class: 'priest',
    name: 'Healing Priest',
    role: 'healer',
    upstreamDir: 'priest/healer',
  },
  { id: 'rogue', proto: 11, class: 'rogue', name: 'Rogue', role: 'dps', upstreamDir: 'rogue/dps' },
  {
    id: 'elemental-shaman',
    proto: 12,
    class: 'shaman',
    name: 'Elemental Shaman',
    role: 'dps',
    upstreamDir: 'shaman/elemental',
  },
  {
    id: 'enhancement-shaman',
    proto: 13,
    class: 'shaman',
    name: 'Enhancement Shaman',
    role: 'dps',
    upstreamDir: 'shaman/enhancement',
  },
  {
    id: 'restoration-shaman',
    proto: 14,
    class: 'shaman',
    name: 'Restoration Shaman',
    role: 'healer',
    upstreamDir: 'shaman/restoration',
  },
  { id: 'warlock', proto: 15, class: 'warlock', name: 'Warlock', role: 'dps', upstreamDir: 'warlock/dps' },
  {
    id: 'dps-warrior',
    proto: 16,
    class: 'warrior',
    name: 'DPS Warrior',
    role: 'dps',
    upstreamDir: 'warrior/dps',
  },
  {
    id: 'protection-warrior',
    proto: 17,
    class: 'warrior',
    name: 'Protection Warrior',
    role: 'tank',
    upstreamDir: 'warrior/protection',
  },
] as const satisfies readonly {
  id: string;
  proto: number;
  class: ClassId;
  name: string;
  role: Role;
  upstreamDir: string;
}[];
export type SpecId = (typeof SPECS)[number]['id'];
export const SPEC_IDS = SPECS.map((s) => s.id) as SpecId[];

/** Gear slots in the engine's ItemSlot order (the index is the proto value). */
export const ITEM_SLOTS = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'mainHand',
  'offHand',
  'ranged',
] as const;
export type ItemSlotId = (typeof ITEM_SLOTS)[number];

export const MAX_LEVEL = 60;
