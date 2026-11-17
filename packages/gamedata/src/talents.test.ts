import { CLASS_IDS, SPECS } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { loadSpecPresets, PRESET_INDEX } from './presets';
import {
  MAX_TALENT_POINTS,
  addPointBlocker,
  brokenTalents,
  canAddPoint,
  canRemovePoint,
  classTalents,
  clearTree,
  parseTalents,
  removePointBlocker,
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

describe('why a point cannot come out', () => {
  // The shaman export's build: Enhancement 25 (Stormstrike 1/1 under Improved Stormstrike 2/2), Restoration 8.
  const shaman = parseTalents('shaman', '-0530303100212122-053');
  const enh = classTalents('shaman').trees[1]!.talents;
  const at = (name: string) => enh.findIndex((t) => t.name === name);

  it('names the talent that needs it as a prerequisite', () => {
    // With a spare point in Toughness, tier 5 keeps its 20 points when Stormstrike loses one.
    const spare = parseTalents('shaman', '-0530303101212122-053');
    expect(removePointBlocker('shaman', spare, 1, at('Stormstrike'))).toBe(
      "Can't remove: Improved Stormstrike needs it",
    );
    expect(removePointBlocker('shaman', shaman, 1, at('Stormstrike'))).toBe(
      "Can't remove: Improved Stormstrike needs it; talents in tier 5 need 20 points above them",
    );
  });

  it('names the tier that would fall short of points', () => {
    // Tiers 1 to 3 hold exactly 15 points, so any point out of them leaves tier 4 short.
    expect(removePointBlocker('shaman', shaman, 1, at('Thundering Strikes'))).toBe(
      "Can't remove: talents in tier 4 need 15 points above them",
    );
  });

  it('gives both reasons when both apply', () => {
    const pre = enh[at('Flurry')]!.prereq!;
    expect(removePointBlocker('shaman', shaman, 1, pre)).toBe(
      "Can't remove: Flurry needs it; talents in tier 4 need 15 points above them",
    );
  });

  it('is null when the point can come out, or there is none', () => {
    expect(removePointBlocker('shaman', shaman, 1, at('Improved Stormstrike'))).toBeNull();
    expect(removePointBlocker('shaman', shaman, 1, at('Toughness'))).toBeNull();
    expect(canRemovePoint('shaman', shaman, 1, at('Improved Stormstrike'))).toBe(true);
  });
});

describe('why a point cannot go in', () => {
  const arms = classTalents('warrior').trees[0]!.talents;
  const row1 = arms.findIndex((t) => t.row === 1);
  const empty = parseTalents('warrior', '');

  it('is null when the point can go in', () => {
    expect(addPointBlocker('warrior', empty, 0, 0)).toBeNull();
  });

  it('names the tier and the points it still needs', () => {
    const three = fill('warrior', [[0, 0, 3]]);
    expect(addPointBlocker('warrior', three, 0, row1)).toBe(
      "Can't add: tier 2 needs 5 points in Arms above it (3 so far)",
    );
  });

  it('names the prerequisite that is not at its maximum', () => {
    const child = arms.findIndex((t) => t.prereq !== undefined);
    const pre = arms[arms[child]!.prereq!]!;
    // Every point the child's tier needs, but none in the prerequisite.
    let q = parseTalents('warrior', '');
    for (let i = 0; i < arms.length; i++)
      if (i !== arms[child]!.prereq && arms[i]!.row < arms[child]!.row)
        while (canAddPoint('warrior', q, 0, i) && treePoints(q, 0) < arms[child]!.row * 5)
          q = stepTalent('warrior', q, 0, i, 1);
    expect(treePoints(q, 0)).toBe(arms[child]!.row * 5);
    expect(addPointBlocker('warrior', q, 0, child)).toBe(
      `Can't add: needs ${pre.maxPoints}/${pre.maxPoints} in ${pre.name}`,
    );
  });

  it('says when the talent is maxed or every point is spent', () => {
    const maxed = fill('warrior', [[0, 0, arms[0]!.maxPoints]]);
    expect(addPointBlocker('warrior', maxed, 0, 0)).toBe(
      `Can't add: ${arms[0]!.name} is at its maximum rank`,
    );
    const full = parseTalents('warrior', '30303213132215201-55050000002-2');
    expect(totalPoints(full)).toBe(MAX_TALENT_POINTS);
    const open = full[2]!.findIndex(
      (v, i) => v === 0 && classTalents('warrior').trees[2]!.talents[i]!.row === 0,
    );
    expect(addPointBlocker('warrior', full, 2, open)).toBe(
      `Can't add: all ${MAX_TALENT_POINTS} talent points are spent`,
    );
  });
});
