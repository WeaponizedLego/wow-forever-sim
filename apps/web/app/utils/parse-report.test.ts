import type { Diagnostic } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { isUnusedNote, parseReport, unusedSummary } from './parse-report';

// The real level 42 shaman export's diagnostics (fixtures/import/real/simc-shaman-lvl42.simc), abridged.
const SHAMAN: Diagnostic[] = [
  { code: 'LEVEL-07', severity: 'warning', message: 'Level 42 character.', line: 7, field: 'level' },
  { code: 'SPEC-06', severity: 'info', message: 'Spec not in the export.', line: 13, field: 'spec' },
  {
    code: 'PARSE-02',
    severity: 'info',
    message: 'legacy_talents skipped; the engine does not use it.',
    line: 20,
    field: 'legacy_talents',
  },
  {
    code: 'PARSE-02',
    severity: 'info',
    message: 'Back: content_tuning skipped; the engine does not use it.',
    line: 29,
    field: 'back',
  },
  {
    code: 'PARSE-02',
    severity: 'info',
    message: 'shirt slot skipped; the engine does not use it.',
    line: 33,
    field: 'shirt',
  },
  { code: 'PARSE-02', severity: 'info', message: 'bag1 skipped; the engine does not use it.', line: 57 },
  { code: 'DEFAULT-05', severity: 'info', message: 'Rotation not in the export.', field: 'rotation' },
  { code: 'PARSE-02', severity: 'info', message: 'Unknown option "foo" skipped.', line: 61 },
];

describe('parse report', () => {
  it('sets aside the lines the engine does not use, marked OK', () => {
    const r = parseReport(SHAMAN);
    expect(r.unused.map((i) => i.where)).toEqual(['line 20', 'line 29', 'line 33', 'line 57']);
    expect(r.unused.every((i) => i.status === 'good')).toBe(true);
    expect(unusedSummary(r.unused.length)).toBe('4 lines not used by the sim');
    expect(unusedSummary(1)).toBe('1 line not used by the sim');
  });

  it('lists warnings first, then the notes worth reading, with badges that match', () => {
    const r = parseReport(SHAMAN);
    expect(r.items.map((i) => [i.status, i.code])).toEqual([
      ['warning', 'LEVEL-07'],
      ['info', 'SPEC-06'],
      ['info', 'DEFAULT-05'],
      ['info', 'PARSE-02'], // an unknown option is worth a look
    ]);
  });

  it('says so when nothing needs reading', () => {
    expect(parseReport([]).items).toEqual([{ status: 'good', text: 'Everything in the export was read.' }]);
    const onlyUnused = parseReport(SHAMAN.filter(isUnusedNote));
    expect(onlyUnused.items).toEqual([{ status: 'good', text: 'Everything the sim uses was read.' }]);
    expect(onlyUnused.unused).toHaveLength(4);
  });

  it('keeps a warning PARSE-02 in the main list', () => {
    const d: Diagnostic = { code: 'PARSE-02', severity: 'warning', message: 'Line 3 could not be read.' };
    expect(isUnusedNote(d)).toBe(false);
  });
});
