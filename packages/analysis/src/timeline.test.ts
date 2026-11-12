import { describe, expect, it } from 'vitest';
import { auraLanes, damageSeries, parseCombatLog, parseLogUnit, resourceSeries } from './combatLog';
import { CD_04, DATA_03, HIT_01, RES_02, cooldownKeysFromLog, evaluateNotes } from './notes';
import { resourceWaste } from './auras';
import { findPlayer } from './abilities';
import { ResourceType } from '@fsim/proto/spell';
import { raidFixture } from './testFixtures';

const result = raidFixture();
const events = parseCombatLog(result.logs);
const duration = result.firstIterationDuration;

describe('parseCombatLog', () => {
  it('parses units', () => {
    expect(parseLogUnit('Target 1')).toEqual({ kind: 'target', index: 0, name: '', label: 'Target 1' });
    expect(parseLogUnit(' (#1)')).toEqual({ kind: 'player', index: 0, name: '', label: ' (#1)' });
    expect(parseLogUnit('Bob (#2)')).toMatchObject({ kind: 'player', index: 1, name: 'Bob' });
    expect(parseLogUnit('Bob (#2) - Cat')).toMatchObject({ kind: 'pet', index: 1, name: 'Cat' });
  });

  it('parses the event kinds the timeline needs from a synthetic log', () => {
    const ev = parseCombatLog(
      [
        '[1.06] [Bob (#1)] [Target 1] {OtherID: 4} Hit for 736.530 damage (SpellSchool: 1). (Threat: 736.530)',
        '[3.62] [Bob (#1)] [Target 1] {SpellID: 13555} tick Crit for 353.846 damage (SpellSchool: 8). (Threat: 1)',
        '[9.06] [Bob (#1)] [Target 1] {ItemID: 18588} Miss (SpellSchool: 4). (Threat: 0.000)',
        '[0.00] [Target 1] Aura gained: {SpellID: 20346, Tag: -1}',
        '[-19.00] [Bob (#1)] {OtherID: 20} stacks: 0 --> 12',
        '[5.08] [Bob (#1)] Major cooldown used: {SpellID: 3045}',
        '[-22.00] [Bob (#1)] Completed cast {SpellID: 14325}',
        '[2.00] [Bob (#1)] Gained 12.000 rage from {SpellID: 1} (10.000 --> 22.000) of 100.000 total.',
        '[2.50] [Bob (#1)] Spent 30.000 rage from {SpellID: 2} (22.000 --> -8.000) of 100.000 total.',
        '[0.00] [Bob (#1)] Pausing rotation for 100ms due to resources / CDs.',
        'garbage',
      ].join('\n'),
    );
    expect(ev.map((e) => e.type)).toEqual([
      'damage',
      'damage',
      'damage',
      'aura',
      'aura-stacks',
      'major-cooldown',
      'cast',
      'resource',
      'resource',
    ]);
    expect(ev[0]).toMatchObject({ t: 1.06, key: 'other:4', outcome: 'hit', tick: false, amount: 736.53 });
    expect(ev[0]!.type === 'damage' && ev[0]!.target?.kind).toBe('target');
    expect(ev[1]).toMatchObject({ key: 'spell:13555', outcome: 'crit', tick: true });
    expect(ev[2]).toMatchObject({ key: 'item:18588', outcome: 'miss', amount: 0 });
    expect(ev[3]).toMatchObject({ key: 'spell:20346#-1', change: 'gained', unit: { kind: 'target' } });
    expect(ev[4]).toMatchObject({ t: -19, from: 0, to: 12 });
    expect(ev[7]).toMatchObject({ resource: 'rage', amount: 12, after: 22 });
    expect(ev[8]).toMatchObject({ amount: -30, after: -8 });
  });

  it('reproduces iteration-1 damage from the fixture log', () => {
    const series = damageSeries(events, duration, { bucketSeconds: 5 });
    expect(series).toHaveLength(Math.ceil(duration / 5));
    const last = series[series.length - 1]!;
    // Iteration-1 DPS must be a plausible draw from the run's distribution.
    const dps = result.raidMetrics!.dps!;
    expect(last.cumulativeDps).toBeGreaterThan(dps.min);
    expect(last.cumulativeDps).toBeLessThan(dps.max);
    // Independent sum straight from the text.
    let sum = 0;
    for (const line of result.logs.split('\n')) {
      const m = /^\[(-?[\d.]+)\] \[ \(#1\)\] \[Target 1\] .* for ([\d.]+) damage/.exec(line);
      if (m && Number(m[1]) >= 0) sum += Number(m[2]);
    }
    expect(last.cumulativeDps).toBeCloseTo(sum / duration, 6);
  });

  it('builds aura lanes clipped to the fight', () => {
    const lanes = auraLanes(events, duration);
    const rapidFire = lanes.find((l) => l.key === 'spell:3045' && l.unit.kind === 'player')!;
    expect(rapidFire.intervals).toEqual([[5.08, 20.08]]);
    expect(rapidFire.uptimeSeconds).toBeCloseTo(15, 9);
    for (const l of lanes) {
      for (const [a, b] of l.intervals) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(duration);
        expect(b).toBeGreaterThan(a);
      }
    }
  });

  it('extracts resource levels', () => {
    const mana = resourceSeries(events, 'mana', ' (#1)');
    expect(mana.length).toBeGreaterThan(100);
    expect(mana.every(([, v]) => v >= 0)).toBe(true);
  });
});

describe('run notes', () => {
  it('HIT-01 fires below cap and prices the next 1% from the weight', () => {
    const n = HIT_01.evaluate({
      hit: { current: 8, cap: 9, weightPerPercent: { weight: 34.9, stdev: 1.8 / 1.96 } },
    });
    expect(n?.text).toBe('Hit is 8.0%, 1.0% under the 9.0% cap. The next 1.0% is worth ≈ +34.9 DPS (±1.8).');
    expect(n?.severity).toBe('info');
    expect(HIT_01.evaluate({ hit: { current: 9, cap: 9, weightPerPercent: null } })).toBeNull();
    expect(HIT_01.evaluate({})).toBeNull();
    // Gap below 1% prices only the gap.
    const half = HIT_01.evaluate({
      hit: { current: 8.5, cap: 9, weightPerPercent: { weight: 30, stdev: 0 } },
    });
    expect(half?.data.gain).toBe(15);
  });

  it('RES-02 uses resource overflow and is labelled approximate', () => {
    const rows = resourceWaste(findPlayer(result)!, result.iterationsDone);
    // Hunter mana overflows ~4%, but mana is not checked by default.
    expect(RES_02.evaluate({ resources: { rows } })).toBeNull();
    const n = RES_02.evaluate({ resources: { rows, types: [ResourceType.ResourceTypeMana] } });
    expect(n?.id).toBe('RES-02');
    expect(n?.text).toMatch(/^Mana overflowed its cap: \d+\.\d% of mana gained/);
    expect(n?.data.approximate).toBe(true);
    expect(
      RES_02.evaluate({ resources: { rows, types: [ResourceType.ResourceTypeMana], threshold: 0.9 } }),
    ).toBeNull();
  });

  it('DATA-03 lists missing items', () => {
    expect(
      DATA_03.evaluate({ missingItems: { items: [{ slot: 'shoulder', itemId: 99412 }], dataBuild: '70862' } })
        ?.text,
    ).toBe(
      'Shoulder item 99412 is not in data build 70862 and was left out of the sim. Results understate DPS.',
    );
    expect(
      DATA_03.evaluate({
        missingItems: {
          items: [
            { slot: 'shoulder', itemId: 99412 },
            { slot: 'finger2', itemId: null },
          ],
          dataBuild: null,
        },
      })?.text,
    ).toBe(
      '2 items are not in the game data and were left out of the sim: Shoulder item 99412, Ring 2 item. Results understate DPS.',
    );
    expect(DATA_03.evaluate({ missingItems: { items: [], dataBuild: null } })).toBeNull();
  });

  it('CD-04 finds overlapping cooldowns in iteration 1', () => {
    const keys = cooldownKeysFromLog(events);
    expect(keys).toEqual(expect.arrayContaining(['spell:20572', 'spell:3045', 'item:250943']));
    const n = CD_04.evaluate({
      cooldowns: {
        lanes: auraLanes(events, duration),
        cooldownKeys: keys,
        names: { 'spell:20572': 'Blood Fury', 'spell:3045': 'Rapid Fire' },
      },
    });
    expect(n?.text).toBe(
      'In iteration 1, Blood Fury and Rapid Fire overlap for 100% of the shorter one (15.0s).',
    );
    expect(n?.data.iterationOneOnly).toBe(true);
  });

  it('evaluateNotes runs every rule in order', () => {
    const notes = evaluateNotes({
      hit: { current: 8, cap: 9, weightPerPercent: null },
      missingItems: { items: [{ slot: 'head', itemId: 1 }], dataBuild: null },
    });
    expect(notes.map((n) => n.id)).toEqual(['HIT-01', 'DATA-03']);
  });
});
