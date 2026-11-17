import { CLASS_IDS, SPECS } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { loadSpecPresets, PRESET_INDEX } from './presets';
import {
  MAX_TALENT_POINTS,
  brokenTalents,
  canAddPoint,
  canRemovePoint,
  classTalents,
  clearTree,
  parseTalents,
  serializeTalents,
  stepTalent,
  talentIconUrl,
  talentProblems,
  talentTreeNames,
  talentsFit,
  totalPoints,
  treePoints,
  type TalentPoints,
} from './talents';

const fill = (cls: 'warrior', steps: [number, number, number][]): TalentPoints =>
  steps.reduce(
    (p, [t, i, n]) => {
      for (let k = 0; k < n; k++) p = stepTalent(cls, p, t, i, 1);
      return p;
    },
    parseTalents(cls, ''),
  );

describe('talent tree data', () => {
  it('has three trees per class, listed row by row, with resolvable prerequisites and icons', () => {
    for (const cls of CLASS_IDS) {
      const data = classTalents(cls);
      expect(data.class).toBe(cls);
      expect(data.trees).toHaveLength(3);
      expect(data.upstream.commit).toBe(PRESET_INDEX.commit);
      for (const tree of data.trees) {
        expect(tree.talents.length).toBeGreaterThan(10);
        tree.talents.forEach((t, i) => {
          const prev = tree.talents[i - 1];
          if (prev) expect(t.row * 10 + t.col, `${cls} ${t.name}`).toBeGreaterThan(prev.row * 10 + prev.col);
          expect(t.row).toBeLessThan(7);
          expect(t.col).toBeLessThan(4);
          expect(t.maxPoints).toBeGreaterThanOrEqual(1);
          expect(t.maxPoints).toBeLessThanOrEqual(5);
          expect(t.icon).toMatch(/^[a-z0-9_.-]+$/);
          expect(t.definitionId).toBeGreaterThan(0);
          if (t.prereq !== undefined) {
            expect(t.prereq).toBeLessThan(i);
            expect(tree.talents[t.prereq]!.row).toBeLessThanOrEqual(t.row);
          }
        });
      }
    }
  });

  it('names the trees in the engine order', () => {
    expect(talentTreeNames('warrior')).toEqual(['Arms', 'Fury', 'Protection']);
    expect(talentTreeNames('druid')).toEqual(['Balance', 'Feral Combat', 'Restoration']);
    expect(talentTreeNames('hunter')).toEqual(['Beast Mastery', 'Marksmanship', 'Survival']);
  });

  it('builds wowhead icon urls', () => {
    expect(talentIconUrl('ability_parry')).toBe(
      'https://wow.zamimg.com/images/wow/icons/medium/ability_parry.jpg',
    );
  });

  it('reads every preset talent string', async () => {
    const broken: string[] = [];
    for (const spec of SPECS) {
      const presets = await loadSpecPresets(spec.id);
      for (const t of presets.talents) {
        expect(talentsFit(spec.class, t.talents), `${spec.id} ${t.id}`).toBe(true);
        const points = parseTalents(spec.class, t.talents);
        expect(totalPoints(points)).toBeLessThanOrEqual(MAX_TALENT_POINTS);
        expect(serializeTalents(points)).toBe(t.talents.replace(/0+(?=-|$)/g, '').replace(/-+$/, ''));
        if (talentProblems(spec.class, t.talents).length) broken.push(`${spec.id}/${t.id}`);
      }
    }
    // Upstream may ship a preset its own trees break (at 540ad8f: healer-priest/holy, 8 points above Discipline's
    // third row); the tab flags those talents. Most presets are clean.
    expect(broken.length).toBeLessThan(3);
  });
});

describe('talent string codec', () => {
  it('round-trips, trimming trailing zeros and dashes', () => {
    const s = '30303213132215201-55050000002-2';
    expect(serializeTalents(parseTalents('warrior', s))).toBe(s);
    expect(serializeTalents(parseTalents('warrior', '0500--05'))).toBe('05--05');
    expect(serializeTalents(parseTalents('warrior', '000-000'))).toBe('');
  });

  it('clamps digits to the maximum and pads short trees', () => {
    const p = parseTalents('warrior', '9');
    expect(p[0]![0]).toBe(classTalents('warrior').trees[0]!.talents[0]!.maxPoints);
    expect(p.map((t) => t.length)).toEqual(classTalents('warrior').trees.map((t) => t.talents.length));
  });

  it('says when a string does not fit the class', () => {
    expect(talentsFit('warrior', '')).toBe(true);
    expect(talentsFit('warrior', '5-5-5-5')).toBe(false);
    expect(talentsFit('warrior', '9')).toBe(false);
    expect(talentsFit('warrior', 'abc')).toBe(false);
    expect(talentsFit('warrior', '0'.repeat(30))).toBe(false);
    expect(talentProblems('warrior', '9')[0]).toMatch(/Not this class/);
  });
});

describe('talent tree rules', () => {
  const arms = classTalents('warrior').trees[0]!.talents;
  const row1 = arms.findIndex((t) => t.row === 1);
  const withPrereq = arms.findIndex((t) => t.prereq !== undefined);

  it('needs 5 points per row above', () => {
    const empty = parseTalents('warrior', '');
    expect(canAddPoint('warrior', empty, 0, 0)).toBe(true);
    expect(canAddPoint('warrior', empty, 0, row1)).toBe(false);
    const five = fill('warrior', [
      [0, 0, 3],
      [0, 1, 2],
    ]);
    expect(treePoints(five, 0)).toBe(5);
    expect(canAddPoint('warrior', five, 0, row1)).toBe(true);
  });

  it('needs the prerequisite at its maximum, and keeps it there while the child holds points', () => {
    const child = arms[withPrereq]!;
    const pre = child.prereq!;
    // Spend enough in the rows above, the prerequisite included, to reach the child's row.
    let p = parseTalents('warrior', '');
    for (let i = 0; i < arms.length && treePoints(p, 0) < child.row * 5; i++)
      if (i !== withPrereq && arms[i]!.row < child.row)
        while (canAddPoint('warrior', p, 0, i)) p = stepTalent('warrior', p, 0, i, 1);
    while (canAddPoint('warrior', p, 0, pre)) p = stepTalent('warrior', p, 0, pre, 1);
    expect(p[0]![pre]).toBe(arms[pre]!.maxPoints);
    expect(canAddPoint('warrior', p, 0, withPrereq)).toBe(true);
    p = stepTalent('warrior', p, 0, withPrereq, 1);
    expect(p[0]![withPrereq]).toBe(1);
    expect(canRemovePoint('warrior', p, 0, pre)).toBe(false);
    expect(brokenTalents('warrior', p).flat().some(Boolean)).toBe(false);
    // Without the prerequisite maxed the child is broken.
    const broken = p.map((t, ti) => (ti === 0 ? t.map((v, i) => (i === pre ? 0 : v)) : t));
    expect(brokenTalents('warrior', broken)[0]![withPrereq]).toBe(true);
    // A broken build can always lose points.
    expect(canRemovePoint('warrior', broken, 0, withPrereq)).toBe(true);
  });

  it('will not take a point that leaves a lower row short', () => {
    const p = stepTalent(
      'warrior',
      fill('warrior', [
        [0, 0, 3],
        [0, 1, 2],
      ]),
      0,
      row1,
      1,
    );
    expect(p[0]![row1]).toBe(1);
    expect(canRemovePoint('warrior', p, 0, 0)).toBe(false);
    expect(canRemovePoint('warrior', p, 0, row1)).toBe(true);
    expect(stepTalent('warrior', p, 0, 0, -1)).toBe(p);
  });

  it(`caps the build at ${MAX_TALENT_POINTS} points`, () => {
    const full = parseTalents('warrior', '30303213132215201-55050000002-2');
    const all = parseTalents('warrior', '');
    let p = all;
    // Fill tree by tree, always the first talent that takes a point, until nothing does.
    for (let guard = 0; guard < 200; guard++) {
      const next = p
        .flatMap((tree, t) => tree.map((_, i) => [t, i] as const))
        .find(([t, i]) => canAddPoint('warrior', p, t, i));
      if (!next) break;
      p = stepTalent('warrior', p, next[0], next[1], 1);
    }
    expect(totalPoints(p)).toBe(MAX_TALENT_POINTS);
    expect(totalPoints(full)).toBe(MAX_TALENT_POINTS);
    expect(talentProblems('warrior', '30303213132215201-55050000002-25')[0]).toMatch(/^56 points/);
  });

  it('clears one tree', () => {
    const p = parseTalents('warrior', '30303213132215201-55050000002-2');
    const cleared = clearTree(p, 0);
    expect(treePoints(cleared, 0)).toBe(0);
    expect(serializeTalents(cleared)).toBe('-55050000002-2');
  });
});
