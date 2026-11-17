import { describe, expect, it } from 'vitest';
import {
  comparableBaseline,
  latestOfLineage,
  lineageOf,
  newLineageId,
  runLineage,
  sameLineage,
} from './lineage';

interface Rec {
  id: string;
  lineageId?: string;
  baselineId?: string;
}
const entry = (record: Rec) => ({ record });

describe('lineages', () => {
  it('gives every old record without a lineage a lineage of its own', () => {
    expect(lineageOf({ id: '#0003' })).toBe('run:#0003');
    expect(sameLineage({ id: '#0003' }, { id: '#0002' })).toBe(false);
    expect(sameLineage({ id: '#0003', lineageId: 'a' }, { id: '#0002', lineageId: 'a' })).toBe(true);
    expect(sameLineage({ id: '#0003', lineageId: 'a' }, { id: '#0002', lineageId: 'b' })).toBe(false);
  });

  it('new lineage ids are unique', () => {
    expect(newLineageId()).not.toBe(newLineageId());
  });
});

describe('comparableBaseline', () => {
  const runs = [
    entry({ id: '#0004', lineageId: 'B', baselineId: '#0003' }),
    entry({ id: '#0003', lineageId: 'A', baselineId: '#0002' }),
    entry({ id: '#0002', lineageId: 'A' }),
    entry({ id: '#0001' }),
  ];
  const find = (id: string) => runs.find((r) => r.record.id === id) ?? null;

  it('compares within a lineage', () => {
    expect(comparableBaseline(runs[1]!.record, find)?.record.id).toBe('#0002');
  });

  it('never compares across lineages (another character loaded in between)', () => {
    expect(comparableBaseline(runs[0]!.record, find)).toBeNull();
  });

  it('ignores the stale cross-character baseline of an old record', () => {
    // Before lineages, every run named the previous run as its baseline, whatever the character.
    const old = { id: '#0002', baselineId: '#0001' };
    expect(comparableBaseline(old, find)).toBeNull();
  });

  it('is null without a baseline, or when the baseline run is gone', () => {
    expect(comparableBaseline(runs[2]!.record, find)).toBeNull();
    expect(comparableBaseline({ id: '#0009', lineageId: 'A', baselineId: '#0007' }, find)).toBeNull();
  });

  it('finds the newest run of a lineage', () => {
    expect(latestOfLineage(runs, 'A')?.record.id).toBe('#0003');
    expect(latestOfLineage(runs, 'run:#0001')?.record.id).toBe('#0001');
    expect(latestOfLineage(runs, 'C')).toBeNull();
  });
});

describe('runLineage', () => {
  const exists = (id: string) => id === '#0001';

  it('keeps the given lineage and its baseline run', () => {
    expect(runLineage({ lineageId: 'A', baselineId: '#0001' }, exists)).toEqual({
      lineageId: 'A',
      baselineId: '#0001',
    });
  });

  it('drops a baseline run that no longer exists (history cleared)', () => {
    expect(runLineage({ lineageId: 'A', baselineId: '#0007' }, exists)).toEqual({ lineageId: 'A' });
  });

  it('starts a lineage with no baseline when none is given (a new import, preset or share link)', () => {
    const r = runLineage(null, exists);
    expect(r.lineageId).toMatch(/.{8,}/);
    expect(r.baselineId).toBeUndefined();
  });
});
