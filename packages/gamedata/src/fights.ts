// Fight styles → the engine's Encounter. The styles themselves (values, slice schedule) live in
// @fsim/contracts fight-styles.ts; this file turns one into targets the engine understands.
import {
  fightStyle,
  type Encounter as CharacterEncounter,
  type FightSegment,
  type FightStyleId,
} from '@fsim/contracts';
import type { RaidSimResult } from '@fsim/proto/api';
import { Encounter, InputType, Target, TargetInput } from '@fsim/proto/common';

/**
 * The site's default raid target (upstream Encounter.defaultTargetProto): a level 63 dragonkin raid boss with
 * 1,428,900 health, 3,731 armor and 54 block value. Copied from a request the engine's own builder produced.
 */
export const DEFAULT_TARGET_JSON = {
  id: 31146,
  name: 'Raid Target',
  level: 63,
  mobType: 'MobTypeDragonkin',
  stats: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 320, 0, 0, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 3731, 0, 1428900, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  minBaseDamage: 2601,
  damageSpread: 0.5,
  swingSpeed: 2,
  parryHaste: true,
  canCrush: true,
} as const;

/**
 * Target id of the engine's "slice mob" (tools/engine-build/patches/fsim_slice_mob.go.txt, our engine patch):
 * a target that spawns and dies at the times its target inputs give. An engine built without the patch treats
 * it as a plain target with no AI, so a mob disabled at start never appears (`sliceRanAsScheduled` spots that).
 */
export const SLICE_MOB_ID = 2_000_000_101;

/** The encounter fields the engine sims: a style's own values, or the character's for `custom`. */
export function effectiveEncounter(e: CharacterEncounter): CharacterEncounter {
  const values = fightStyle(e.style).values;
  return values ? { ...e, ...values } : e;
}

/** Switching the picker: a preset brings its values; Custom starts from what was simmed until now. */
export function withFightStyle(e: CharacterEncounter, style: FightStyleId): CharacterEncounter {
  return { ...effectiveEncounter(e), style, ...fightStyle(style).values };
}

/** "Patchwerk 3 min", or for Custom "Custom 240 s ±5 · 3 tgt · lvl 62". */
export function fightLabel(e: CharacterEncounter, opts: { short?: boolean } = {}): string {
  const s = fightStyle(e.style);
  if (s.values) return opts.short ? s.short : s.label;
  const parts = [`${e.durationSec} s${e.durationVariationSec ? ` ±${e.durationVariationSec}` : ''}`];
  parts.push(`${e.targetCount} tgt`);
  if (e.targetLevel !== 63) parts.push(`lvl ${e.targetLevel}`);
  if (!e.executePhase) parts.push('no execute');
  return `${opts.short ? 'Custom' : s.label} ${parts.join(' · ')}`;
}

/** Segments the timeline draws: the style's own, or one segment spanning the fight. */
export function fightSegments(e: CharacterEncounter): readonly FightSegment[] {
  const eff = effectiveEncounter(e);
  const segs = fightStyle(eff.style).segments;
  if (segs.length) return segs;
  return [
    {
      kind: 'boss',
      label: eff.targetCount === 1 ? 'Raid boss' : `${eff.targetCount} raid targets`,
      mobs: eff.targetCount,
      startSec: 0,
      endSec: eff.durationSec,
    },
  ];
}

function slicedTargets(segments: readonly FightSegment[], level: number): Target[] {
  const targets: Target[] = [];
  for (const seg of segments) {
    for (let i = 0; i < seg.mobs; i++) {
      const t = Target.fromJson(DEFAULT_TARGET_JSON as never);
      t.id = SLICE_MOB_ID;
      t.name = seg.mobs === 1 ? seg.label : `${seg.label} · ${i + 1}`;
      t.level = level;
      t.canCrush = level >= 63;
      t.disabledAtStart = seg.startSec > 0;
      // Order matters: the engine patch reads them by index.
      t.targetInputs = [
        TargetInput.create({ inputType: InputType.Number, label: 'Spawn at', numberValue: seg.startSec }),
        TargetInput.create({ inputType: InputType.Number, label: 'Despawn at', numberValue: seg.endSec }),
        TargetInput.create({ inputType: InputType.Number, label: 'Kill share %', numberValue: 100 }),
      ];
      targets.push(t);
    }
  }
  return targets;
}

/** The engine Encounter for a character's fight. */
export function encounterProto(e: CharacterEncounter): Encounter {
  const eff = effectiveEncounter(e);
  const segments = fightStyle(eff.style).segments;
  let targets: Target[];
  if (segments.length) {
    targets = slicedTargets(segments, eff.targetLevel);
  } else {
    targets = [];
    for (let i = 0; i < eff.targetCount; i++) {
      const t = Target.fromJson(DEFAULT_TARGET_JSON as never);
      t.level = eff.targetLevel;
      if (i > 0) t.name = `Raid Target ${i + 1}`;
      targets.push(t);
    }
  }
  return Encounter.create({
    duration: eff.durationSec,
    durationVariation: eff.durationVariationSec,
    executeProportion20: eff.executePhase ? 0.2 : 0,
    executeProportion35: eff.executePhase ? 0.35 : 0,
    targets,
  });
}

/**
 * Whether a dungeon-slice result came from an engine that ran the schedule: every pull's first mob took damage.
 * An engine without our patch never spawns a mob that is disabled at start, so later pulls take none. True for
 * any other style, and when the result carries no per-target damage to judge by.
 */
export function sliceRanAsScheduled(e: CharacterEncounter, result: RaidSimResult): boolean {
  const segments = fightStyle(e.style).segments;
  if (!segments.length) return true;
  const player = result.raidMetrics?.parties[0]?.players[0];
  if (!player) return true;
  const taken = new Map<number, number>();
  for (const action of player.actions)
    for (const t of action.targets) taken.set(t.unitIndex, (taken.get(t.unitIndex) ?? 0) + t.damage);
  if (taken.size === 0) return true;
  // Target unit indices, in encounter order.
  const unitIndex = result.encounterMetrics?.targets.map((t) => t.unitIndex) ?? [];
  let first = 0;
  for (const seg of segments) {
    const idx = unitIndex[first];
    if (idx !== undefined && !((taken.get(idx) ?? 0) > 0)) return false;
    first += seg.mobs;
  }
  return true;
}
