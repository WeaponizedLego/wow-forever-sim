import { z } from 'zod';
import { CLASS_IDS, ITEM_SLOTS, MAX_LEVEL, RACE_IDS, SPEC_IDS } from './game';

/**
 * The app's own description of a character. Every import path (SimC, WoWSims, Wowhead, build from
 * scratch) produces one; the engine package turns it into a `Player` proto plus its `SimDatabase`.
 * Kept engine-agnostic on purpose: no proto types here, only ids.
 */

export const GearItemSchema = z.object({
  itemId: z.number().int().positive(),
  enchantId: z.number().int().positive().optional(),
  randomSuffix: z.number().int().optional(),
});
export type GearItem = z.infer<typeof GearItemSchema>;

export const GearSchema = z.partialRecord(z.enum(ITEM_SLOTS), GearItemSchema);
export type Gear = z.infer<typeof GearSchema>;

/** Rotation is either one of the spec's upstream presets or user-written SIML. */
export const RotationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), presetId: z.string() }),
  z.object({ kind: z.literal('siml'), source: z.string() }),
]);
export type Rotation = z.infer<typeof RotationSchema>;

export const BuffsPresetSchema = z.enum(['full-raid', 'five-man', 'solo', 'none']);
export type BuffsPreset = z.infer<typeof BuffsPresetSchema>;

export const EncounterSchema = z.object({
  durationSec: z.number().positive().default(180),
  /** ± seconds; the engine draws each fight's length from duration ± variation. */
  durationVariationSec: z.number().nonnegative().default(5),
  targetCount: z.number().int().min(1).max(5).default(1),
  targetLevel: z
    .number()
    .int()
    .default(MAX_LEVEL + 3),
  executePhase: z.boolean().default(true),
});
export type Encounter = z.infer<typeof EncounterSchema>;

export const CharacterSchema = z.object({
  /** Display only. */
  name: z.string().optional(),
  realm: z.string().optional(),
  region: z.enum(['us', 'eu', 'kr', 'tw', 'cn']).optional(),

  class: z.enum(CLASS_IDS),
  spec: z.enum(SPEC_IDS),
  race: z.enum(RACE_IDS),
  level: z.number().int().min(1).max(MAX_LEVEL).default(MAX_LEVEL),

  gear: GearSchema,
  /** Engine talent string, e.g. "5320001505101251-0052050301-4". */
  talents: z.string(),
  professions: z.array(z.string()).max(2).default([]),

  /**
   * Consumables and per-player settings in the engine's own vocabulary (ConsumesSpec / spec options),
   * passed through untouched. Import code fills what it can read; the engine package fills the rest
   * from the spec's preset.
   */
  consumables: z.record(z.string(), z.unknown()).default({}),
  specOptions: z.record(z.string(), z.unknown()).default({}),

  /** Per-player sim settings; unset fields come from the spec preset. */
  playerOptions: z
    .object({
      distanceFromTarget: z.number().nonnegative().optional(),
      reactionTimeMs: z.number().int().nonnegative().optional(),
      reactionTimeMaxMs: z.number().int().nonnegative().optional(),
      channelClipDelayMs: z.number().int().nonnegative().optional(),
      inFrontOfTarget: z.boolean().optional(),
    })
    .default({}),

  buffs: BuffsPresetSchema.default('full-raid'),
  rotation: RotationSchema,
  encounter: EncounterSchema.default({
    durationSec: 180,
    durationVariationSec: 5,
    targetCount: 1,
    targetLevel: MAX_LEVEL + 3,
    executePhase: true,
  }),
});
export type Character = z.infer<typeof CharacterSchema>;
