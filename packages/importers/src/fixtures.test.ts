// Golden tests: every fixture in fixtures/import imports to the character and diagnostics stored
// next to it in fixtures/import/expected/. Run `vitest -u` after a deliberate change and review the diff.
import { CharacterSchema } from '@fsim/contracts';
import type { Diagnostic, ImportFormat, ImportResult } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { detectFormat, importAny } from './index';
import { FIXTURES, readFixture, testContext } from './test-context';

const ctx = testContext();

const CASES: { file: string; format: ImportFormat }[] = [
  { file: 'simc-fury-warrior.simc', format: 'simc' },
  { file: 'simc-survival-hunter.simc', format: 'simc' },
  { file: 'simc-fire-mage.simc', format: 'simc' },
  { file: 'simc-balance-druid-edited.simc', format: 'simc' },
  { file: 'wowsims-arms-warrior.json', format: 'wowsims-json' },
  { file: 'wowhead-sv-hunter.url', format: 'wowhead-url' },
  { file: 'wowhead-moonkin-druid.url', format: 'wowhead-url' },
];

const run = (file: string): ImportResult => importAny(readFixture(file), ctx);
const codes = (r: ImportResult, severity?: Diagnostic['severity']) =>
  r.diagnostics
    .filter((d) => !severity || d.severity === severity)
    .map((d) => `${d.code}@${d.field ?? d.line}`);

describe.each(CASES)('$file', ({ file, format }) => {
  const input = readFixture(file);

  it('is detected as ' + format, () => {
    expect(detectFormat(input)).toBe(format);
  });

  it('imports to the golden character and diagnostics', async () => {
    const result = run(file);
    expect(result.format).toBe(format);
    expect(result.character).not.toBeNull();
    expect(CharacterSchema.safeParse(result.character).success).toBe(true);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    await expect(JSON.stringify(result, null, 2) + '\n').toMatchFileSnapshot(
      `${FIXTURES}expected/${file.replace(/\.[a-z]+$/, '')}.json`,
    );
  });
});

describe('fixture specifics', () => {
  it('Fury warrior: unknown shoulder is a DATA-03 warning on its line, slot left empty', () => {
    const r = run('simc-fury-warrior.simc');
    const d = r.diagnostics.find((x) => x.code === 'DATA-03');
    expect(d).toMatchObject({ severity: 'warning', field: 'shoulder' });
    expect(readFixture('simc-fury-warrior.simc').split('\n')[d!.line! - 1]).toBe('shoulder=,id=99412');
    expect(r.character!.gear.shoulder).toBeUndefined();
    expect(r.character).toMatchObject({ class: 'warrior', spec: 'dps-warrior', race: 'orc', talents: '' });
    expect(r.character!.gear.mainHand).toEqual({ itemId: 12774, enchantId: 1900 });
    expect(codes(r, 'warning')).toContain('DEFAULT-05@talents');
  });

  it('Survival hunter: malformed line is PARSE-02 with its line, pet/bag/ammo lines are info', () => {
    const r = run('simc-survival-hunter.simc');
    const lines = readFixture('simc-survival-hunter.simc').split('\n');
    const bad = r.diagnostics.find((x) => x.code === 'PARSE-02' && x.severity === 'warning');
    expect(lines[bad!.line! - 1]).toBe('waist,id=16680');
    expect(r.character!.gear.waist).toBeUndefined();
    expect(r.character!.gear.finger2).toEqual({ itemId: 11990, randomSuffix: 12728 });
    expect(r.character!.gear.ranged).toEqual({ itemId: 22347, enchantId: 2523 });
    expect(r.character).toMatchObject({ spec: 'hunter', professions: ['engineering', 'blacksmithing'] });
    expect(codes(r, 'info')).toEqual(
      expect.arrayContaining(['PARSE-02@ammo', 'PARSE-02@pet_family', 'PARSE-02@bag1']),
    );
  });

  it('Fire mage: skyborne_alliance is High Order Skyborne; unknown enchant keeps the item', () => {
    const r = run('simc-fire-mage.simc');
    expect(r.character).toMatchObject({ class: 'mage', spec: 'mage', race: 'highorderskyborne' });
    expect(r.character!.gear.hands).toEqual({ itemId: 16684 });
    expect(r.diagnostics.find((x) => x.code === 'DATA-03')).toMatchObject({
      field: 'hands',
      severity: 'warning',
    });
  });

  it('Balance druid (edited): named spec and engine talents are used as is', () => {
    const r = run('simc-balance-druid-edited.simc');
    expect(r.character).toMatchObject({
      spec: 'balance-druid',
      race: 'nightelf',
      talents: '5232220115501351--5053',
      region: 'us',
    });
    expect(r.diagnostics.some((d) => d.code === 'SPEC-04')).toBe(false);
  });

  it('WoWSims: positional gear with a null off hand, spec from the export', () => {
    const r = run('wowsims-arms-warrior.json');
    expect(r.character).toMatchObject({
      spec: 'dps-warrior',
      race: 'dwarf',
      talents: '30303213132215201-55050000002-2',
    });
    expect(r.character!.gear.offHand).toBeUndefined();
    expect(r.character!.gear.ranged).toEqual({ itemId: 16996 });
    expect(r.character!.gear.finger2).toEqual({ itemId: 11990, randomSuffix: 12727 });
  });

  it('Wowhead: enchants resolved from spell ids, spec inferred from talents', () => {
    const r = run('wowhead-sv-hunter.url');
    expect(r.character).toMatchObject({
      spec: 'hunter',
      race: 'orc',
      talents: '1-00530501114-52225303000021005',
    });
    expect(r.character!.gear.back).toEqual({ itemId: 18511, enchantId: 849 });
    expect(Object.keys(r.character!.gear)).toHaveLength(16); // two-hander, no off hand

    const d = run('wowhead-moonkin-druid.url');
    expect(d.character).toMatchObject({ spec: 'balance-druid', race: 'windshaperskyborne' });
    expect(codes(d, 'warning')).toEqual(expect.arrayContaining(['DATA-03@shoulder', 'DATA-03@chest']));
  });
});
