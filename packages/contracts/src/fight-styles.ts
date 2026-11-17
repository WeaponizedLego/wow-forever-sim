import { MAX_LEVEL } from './game';

/**
 * Fight styles: named encounter setups every sim (quick sim, stat weights, top gear, hit scaling, …) runs the
 * same way. This table is the one place they are defined; the Workbench reads it for the picker and the
 * timeline, and `@fsim/gamedata`'s request builder turns it into the engine's Encounter.
 *
 * A style other than `custom` fixes every encounter field; `custom` uses the character's own fields.
 */
export const FIGHT_STYLE_IDS = ['patchwerk-3m', 'patchwerk-5m', 'dungeon-slice-5m', 'custom'] as const;
export type FightStyleId = (typeof FIGHT_STYLE_IDS)[number];

/** The encounter fields a style fixes (Encounter without `style`). */
export interface FightValues {
  durationSec: number;
  durationVariationSec: number;
  /** Most targets alive at once. */
  targetCount: number;
  targetLevel: number;
  executePhase: boolean;
}

/**
 * One window of a dungeon slice: `mobs` identical targets spawn at `startSec` and die together at `endSec`.
 * The time between one segment's end and the next one's start is downtime (running to the next pull).
 */
export interface FightSegment {
  kind: 'pack' | 'boss';
  label: string;
  mobs: number;
  startSec: number;
  endSec: number;
}

export interface FightStyle {
  id: FightStyleId;
  /** "Patchwerk 3 min". */
  label: string;
  /** For tight spots: "PW 3m". */
  short: string;
  description: string;
  /** Null for `custom`. */
  values: FightValues | null;
  /** Set for a multi-pull style; empty for a stand-still single fight. */
  segments: readonly FightSegment[];
}

/**
 * Dungeon slice, after SimulationCraft/Raidbots' "DungeonSlice": one continuous 5 minute run through a dungeon,
 * so cooldowns and resources carry from pull to pull. Four trash packs and a boss, with 10 s of downtime
 * between pulls (40 s in all, 13% of the fight). Every mob of a pack spawns together and dies together; AoE
 * hits the whole pack, single-target damage goes to the pack's first mob. Mobs are level 62 (elite dungeon
 * mobs and bosses), and each reaches execute range at the end of its own life, not of the fight.
 */
export const DUNGEON_SLICE_SEGMENTS: readonly FightSegment[] = [
  { kind: 'pack', label: 'Pack 1', mobs: 4, startSec: 0, endSec: 45 },
  { kind: 'pack', label: 'Pack 2', mobs: 3, startSec: 55, endSec: 95 },
  { kind: 'boss', label: 'Boss', mobs: 1, startSec: 105, endSec: 195 },
  { kind: 'pack', label: 'Pack 3', mobs: 5, startSec: 205, endSec: 250 },
  { kind: 'pack', label: 'Pack 4', mobs: 2, startSec: 260, endSec: 300 },
];

const BOSS_LEVEL = MAX_LEVEL + 3;

export const FIGHT_STYLES: readonly FightStyle[] = [
  {
    id: 'patchwerk-3m',
    label: 'Patchwerk 3 min',
    short: 'PW 3m',
    description: 'One raid boss, standing still, for 3 minutes (±5 s). Execute phase at the end.',
    values: {
      durationSec: 180,
      durationVariationSec: 5,
      targetCount: 1,
      targetLevel: BOSS_LEVEL,
      executePhase: true,
    },
    segments: [],
  },
  {
    id: 'patchwerk-5m',
    label: 'Patchwerk 5 min',
    short: 'PW 5m',
    description: 'One raid boss, standing still, for 5 minutes (±5 s). Execute phase at the end.',
    values: {
      durationSec: 300,
      durationVariationSec: 5,
      targetCount: 1,
      targetLevel: BOSS_LEVEL,
      executePhase: true,
    },
    segments: [],
  },
  {
    id: 'dungeon-slice-5m',
    label: 'Dungeon slice 5 min',
    short: 'Dungeon',
    description:
      'A 5 minute dungeon run in one sim: four trash packs (2–5 mobs) and a boss, with 10 s between pulls. Cooldowns and resources carry over.',
    values: {
      durationSec: 300,
      durationVariationSec: 0,
      targetCount: Math.max(...DUNGEON_SLICE_SEGMENTS.map((s) => s.mobs)),
      targetLevel: MAX_LEVEL + 2,
      executePhase: true,
    },
    segments: DUNGEON_SLICE_SEGMENTS,
  },
  {
    id: 'custom',
    label: 'Custom',
    short: 'Custom',
    description: 'Your own length, target count and level. All targets are up for the whole fight.',
    values: null,
    segments: [],
  },
];

export function fightStyle(id: FightStyleId): FightStyle {
  return FIGHT_STYLES.find((s) => s.id === id)!;
}

/** What a new character fights, and what an encounter saved before fight styles existed means with these values. */
export const DEFAULT_FIGHT_STYLE: FightStyleId = 'patchwerk-3m';
