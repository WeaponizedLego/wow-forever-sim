// Typed access to the committed talent trees (data/talents, written by scripts/extract-talents.ts), and the rules
// of a classic tree: 5 points per row, a prerequisite at its maximum, 51 points in all.
//
// Points are kept as `[tree][talent]`, shaped like the class's trees; an engine talent string is one digit per talent
// in that order, trees joined by "-", trailing zeros and dashes dropped (upstream `talents_string.ts`).
import type { ClassId } from '@fsim/contracts';
import { MAX_LEVEL } from '@fsim/contracts';
import druid from '../data/talents/druid.json';
import hunter from '../data/talents/hunter.json';
import mage from '../data/talents/mage.json';
import paladin from '../data/talents/paladin.json';
import priest from '../data/talents/priest.json';
import rogue from '../data/talents/rogue.json';
import shaman from '../data/talents/shaman.json';
import warlock from '../data/talents/warlock.json';
import warrior from '../data/talents/warrior.json';

export interface Talent {
  name: string;
  /** Upstream's proto field name. */
  field?: string;
  /** 0-based grid cell. */
  row: number;
  col: number;
  maxPoints: number;
  spellId: number;
  /** The game's TraitDefinition id. */
  definitionId: number;
  /** Icon name; see `talentIconUrl`. */
  icon: string;
  /** Index in the same tree of the talent that must be at its maximum first. */
  prereq?: number;
}

export interface TalentTree {
  name: string;
  /** Upstream's tree art (wowhead). */
  background: string;
  talents: Talent[];
}

export interface ClassTalents {
  class: ClassId;
  upstream: { repo: string; commit: string; files: string[] };
  trees: TalentTree[];
}

/** Points spent per talent: `[tree][talent]`, shaped like `classTalents(cls).trees`. */
export type TalentPoints = number[][];

/** One point per level from 10: 51 at level 60. */
export const MAX_TALENT_POINTS = MAX_LEVEL - 9;
export const POINTS_PER_ROW = 5;

const DATA: Record<ClassId, ClassTalents> = {
  warrior,
  paladin,
  hunter,
  rogue,
  priest,
  shaman,
  mage,
  warlock,
  druid,
} as Record<ClassId, ClassTalents>;

export function classTalents(cls: ClassId): ClassTalents {
  return DATA[cls];
}

/** The class's tree names in the engine's order ("Arms", "Fury", "Protection"). */
export function talentTreeNames(cls: ClassId): string[] {
  return DATA[cls].trees.map((t) => t.name);
}

export function talentIconUrl(icon: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  return `https://wow.zamimg.com/images/wow/icons/${size}/${icon}.jpg`;
}

/** The string's points, each digit clamped to its talent's maximum; missing trees and digits are 0. */
export function parseTalents(cls: ClassId, talents: string): TalentPoints {
  const parts = talents.split('-');
  return DATA[cls].trees.map((tree, t) =>
    tree.talents.map((talent, i) => {
      const n = Number((parts[t] ?? '').charAt(i));
      return Number.isFinite(n) ? Math.min(talent.maxPoints, Math.max(0, n)) : 0;
    }),
  );
}

export function serializeTalents(points: TalentPoints): string {
  return points
    .map((tree) => tree.join('').replace(/0+$/, ''))
    .join('-')
    .replace(/-+$/, '');
}

export const treePoints = (points: TalentPoints, tree: number): number =>
  (points[tree] ?? []).reduce((a, b) => a + b, 0);

export const totalPoints = (points: TalentPoints): number =>
  points.reduce((a, tree) => a + tree.reduce((b, c) => b + c, 0), 0);

/**
 * Whether the string reads as is for the class: no more than three trees, no tree longer than its talents, every
 * digit within its talent's maximum.
 */
export function talentsFit(cls: ClassId, talents: string): boolean {
  if (!/^\d*(-\d*){0,2}$/.test(talents)) return false;
  const trees = DATA[cls].trees;
  return talents.split('-').every((part, t) => {
    const tree = trees[t];
    return (
      !!tree &&
      part.length <= tree.talents.length &&
      [...part].every((d, i) => Number(d) <= tree.talents[i]!.maxPoints)
    );
  });
}

/**
 * `[tree][talent]`: true where a talent holds points the game would not allow, because the rows above hold fewer
 * than 5 × its row in points that are not themselves broken, or its prerequisite is broken or not at its maximum.
 */
export function brokenTalents(cls: ClassId, points: TalentPoints): boolean[][] {
  return DATA[cls].trees.map((tree, t) => {
    const pts = points[t] ?? [];
    const broken = tree.talents.map(() => false);
    const decided = tree.talents.map(() => false);
    let above = 0;
    // A prerequisite sits in an earlier row or earlier in the same row, so it is decided first.
    const decide = (i: number): boolean => {
      if (decided[i]) return broken[i]!;
      decided[i] = true;
      if (!pts[i]) return false;
      const talent = tree.talents[i]!;
      const pre = talent.prereq;
      broken[i] =
        above < talent.row * POINTS_PER_ROW ||
        (pre !== undefined && (decide(pre) || (pts[pre] ?? 0) < tree.talents[pre]!.maxPoints));
      return broken[i]!;
    };
    let row = 0;
    let inRow = 0;
    tree.talents.forEach((talent, i) => {
      if (talent.row !== row) {
        above += inRow;
        inRow = 0;
        row = talent.row;
      }
      if (!decide(i)) inRow += pts[i] ?? 0;
    });
    return broken;
  });
}

const withPoints = (points: TalentPoints, tree: number, talent: number, n: number): TalentPoints =>
  points.map((p, t) => (t === tree ? p.map((v, i) => (i === talent ? n : v)) : p));

const anyBroken = (cls: ClassId, points: TalentPoints) =>
  brokenTalents(cls, points).some((t) => t.some(Boolean));

/** Whether one more point may go into the talent: below its maximum, under 51 in all, and not broken by it. */
export function canAddPoint(cls: ClassId, points: TalentPoints, tree: number, talent: number): boolean {
  const def = DATA[cls].trees[tree]?.talents[talent];
  const cur = points[tree]?.[talent] ?? 0;
  if (!def || cur >= def.maxPoints || totalPoints(points) >= MAX_TALENT_POINTS) return false;
  return !brokenTalents(cls, withPoints(points, tree, talent, cur + 1))[tree]![talent];
}

/**
 * Whether a point may come out of the talent. As in the game, not when that would leave another talent unable to
 * hold its points (a row below short of points, or a child whose prerequisite drops below its maximum). A build
 * that is already broken (a pasted string) may always lose points.
 */
export function canRemovePoint(cls: ClassId, points: TalentPoints, tree: number, talent: number): boolean {
  const cur = points[tree]?.[talent] ?? 0;
  if (cur <= 0) return false;
  if (anyBroken(cls, points)) return true;
  return !anyBroken(cls, withPoints(points, tree, talent, cur - 1));
}

/** Adds (`delta` 1) or removes (-1) a point when the rules allow it; otherwise returns `points` unchanged. */
export function stepTalent(
  cls: ClassId,
  points: TalentPoints,
  tree: number,
  talent: number,
  delta: 1 | -1,
): TalentPoints {
  const ok = delta > 0 ? canAddPoint(cls, points, tree, talent) : canRemovePoint(cls, points, tree, talent);
  return ok ? withPoints(points, tree, talent, (points[tree]?.[talent] ?? 0) + delta) : points;
}

/** The tree with all its points taken out. */
export function clearTree(points: TalentPoints, tree: number): TalentPoints {
  return points.map((p, t) => (t === tree ? p.map(() => 0) : p));
}

/** What is wrong with an engine talent string for the class, in words; empty when the game would allow it. */
export function talentProblems(cls: ClassId, talents: string): string[] {
  if (!talentsFit(cls, talents)) {
    return [
      'Not this class’s trees: up to three trees separated by “-”, one digit per talent, none above its maximum.',
    ];
  }
  const points = parseTalents(cls, talents);
  const problems: string[] = [];
  const total = totalPoints(points);
  if (total > MAX_TALENT_POINTS)
    problems.push(`${total} points; a level ${MAX_LEVEL} character has ${MAX_TALENT_POINTS}.`);
  const trees = DATA[cls].trees;
  const broken = brokenTalents(cls, points).flatMap((t, ti) =>
    t.flatMap((b, i) => (b ? [trees[ti]!.talents[i]!.name] : [])),
  );
  if (broken.length)
    problems.push(`Not allowed by the tree rules (row or prerequisite not met): ${broken.join(', ')}.`);
  return problems;
}
