import type { ImportResult } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { IMPORTERS, detectFormat, importAny, readWowheadHash, simcImporter, wowsimsImporter } from './index';
import { testContext } from './test-context';

const ctx = testContext();
const b64url = (bytes: number[]) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const codes = (r: ImportResult) => r.diagnostics.map((d) => `${d.code}:${d.severity}`);

describe('detectFormat', () => {
  it.each([
    ['', null],
    ['   \n', null],
    ['hello world', null],
    ['warrior="X"\nlevel=60', 'simc'],
    ['# SimC Addon 12.1.5-04', 'simc'],
    ['head=,id=12620', 'simc'],
    ['{"class":"mage"}', 'wowsims-json'],
    ['https://www.wowhead.com/forever/gear-planner/mage/human/AzwA', 'wowhead-url'],
    ['see https://www.wowhead.com/de/forever/gear-planner/mage/gnome', 'wowhead-url'],
  ])('%j → %s', (input, format) => {
    expect(detectFormat(input)).toBe(format);
  });

  it('reports unrecognised input as FMT-01', () => {
    const r = importAny('lorem ipsum', ctx);
    expect(r).toMatchObject({ format: null, character: null });
    expect(codes(r)).toEqual(['FMT-01:error']);
  });
});

describe('SimC', () => {
  const parse = (s: string) => simcImporter.parse(s, ctx);

  it('needs a class line', () => {
    const r = parse('level=60\nhead=,id=12620');
    expect(r.character).toBeNull();
    expect(codes(r)).toContain('SPEC-04:error');
  });

  it('rejects classes Forever does not have', () => {
    const r = parse('monk="Po"\nwarrior="X"');
    expect(r.character?.class).toBe('warrior');
    expect(r.diagnostics[0]).toMatchObject({ code: 'SPEC-04', severity: 'error', line: 1 });
  });

  it.each([
    ['skyborne_alliance', 'highorderskyborne'],
    ['skyborne_horde', 'windshaperskyborne'],
    ['high_order_skyborne', 'highorderskyborne'],
    ['windshaper_skyborne', 'windshaperskyborne'],
    ['night_elf', 'nightelf'],
    ['undead', 'undead'],
    ['blood_elf', 'bloodelf'],
  ])('race=%s → %s', (race, id) => {
    expect(parse(`druid="X"\nrace=${race}`).character?.race).toBe(id);
  });

  it('flags a race the engine lacks and falls back', () => {
    const r = parse('paladin="X"\nrace=draenei');
    expect(r.character?.race).toBe('human');
    expect(r.diagnostics.find((d) => d.field === 'race')).toMatchObject({
      code: 'SPEC-04',
      severity: 'warning',
      line: 2,
    });
  });

  it.each([
    ['warrior', 'fury', '', 'dps-warrior'],
    ['warrior', 'arms', '', 'dps-warrior'],
    ['warrior', 'protection', '', 'protection-warrior'],
    ['hunter', 'beast_mastery', '', 'hunter'],
    ['druid', 'feral', '', 'feral-cat-druid'],
    ['druid', 'feral', 'tank', 'feral-bear-druid'],
    ['druid', 'guardian', '', 'feral-bear-druid'],
    ['priest', 'discipline', '', 'healer-priest'],
    ['priest', 'shadow', '', 'dps-priest'],
    ['druid', 'unknown', 'tank', 'feral-bear-druid'],
    ['shaman', 'unknown', 'attack', 'enhancement-shaman'],
    ['shaman', 'unknown', 'spell', 'elemental-shaman'],
    ['paladin', 'unknown', 'heal', 'holy-paladin'],
  ])('%s spec=%s role=%s → %s', (cls, spec, role, id) => {
    expect(parse(`${cls}="X"\nspec=${spec}\nrole=${role}`).character?.spec).toBe(id);
  });

  it('infers the spec from engine-format talents when spec is unknown', () => {
    const r = parse('warrior="X"\nspec=unknown\ntalents=0500-0-55305301302110331');
    expect(r.character?.spec).toBe('protection-warrior');
    expect(r.diagnostics.find((d) => d.code === 'SPEC-04')).toMatchObject({ severity: 'info', line: 2 });
  });

  it('reads item names, suffix and unknown keys on gear lines', () => {
    const r = parse('rogue="X"\nmain_hand=dal_rends,id=12940,enchant_id=1900,suffix=-5,gem_id=0');
    expect(r.character?.gear.mainHand).toEqual({ itemId: 12940, enchantId: 1900, randomSuffix: -5 });
    expect(r.diagnostics.find((d) => d.field === 'mainHand')).toMatchObject({
      code: 'PARSE-02',
      severity: 'info',
    });
  });

  it('flags a gear line without an id', () => {
    const r = parse('rogue="X"\nhead=,enchant_id=1900');
    expect(r.character?.gear.head).toBeUndefined();
    expect(r.diagnostics.find((d) => d.field === 'head')).toMatchObject({
      code: 'PARSE-02',
      severity: 'warning',
      line: 2,
    });
  });

  it('accepts Windows line endings and keeps line numbers', () => {
    const r = parse('# c\r\nmage="X"\r\nhead=,id=99412\r\n');
    expect(r.diagnostics.find((d) => d.code === 'DATA-03')).toMatchObject({ line: 3 });
  });

  it('clamps a level the engine cannot model', () => {
    const r = parse('mage="X"\nlevel=70');
    expect(r.character?.level).toBe(60);
    expect(codes(r)).toContain('PARSE-02:warning');
  });
});

describe('WoWSims JSON', () => {
  const parse = (o: unknown) => wowsimsImporter.parse(JSON.stringify(o), ctx);

  it('needs a known class', () => {
    expect(parse({ race: 'Orc' }).character).toBeNull();
    expect(codes(parse({ class: 'monk' }))).toEqual(['SPEC-04:error']);
  });

  it('ignores talents from a non-Forever client', () => {
    const r = parse({ class: 'warrior', flavor: 'vanilla', talents: '05' });
    expect(r.character?.talents).toBe('');
    expect(r.diagnostics.find((d) => d.field === 'talents')).toMatchObject({
      code: 'DEFAULT-05',
      severity: 'warning',
    });
  });

  it('maps exporter spec names', () => {
    expect(parse({ class: 'druid', spec: 'feral_bear' }).character?.spec).toBe('feral-bear-druid');
    expect(parse({ class: 'priest', spec: 'holy_disc' }).character?.spec).toBe('healer-priest');
    expect(parse({ class: 'hunter', spec: 'marksman' }).character?.spec).toBe('hunter');
  });

  it('keeps slots positional around nulls and flags unknown ids', () => {
    const r = parse({ class: 'mage', gear: { items: [null, { id: 99412 }, { id: 22412, enchant: 2650 }] } });
    expect(r.character?.gear).toEqual({ shoulder: { itemId: 22412 } });
    expect(r.diagnostics.filter((d) => d.code === 'DATA-03').map((d) => d.field)).toEqual([
      'neck',
      'shoulder',
    ]);
  });

  it('notes an exported rotation it does not import', () => {
    expect(codes(parse({ class: 'mage', rotation: { type: 'TypeAPL' } }))).toContain('PARSE-02:info');
  });

  it.each(['not json', '[1]', 'null', '"x"', '{"class": 5}'])('returns an error for %j', (s) => {
    const r = wowsimsImporter.parse(s, ctx);
    expect(r.character).toBeNull();
    expect(r.diagnostics[0]?.severity).toBe('error');
  });
});

describe('Wowhead hash', () => {
  // Byte vector from upstream's wowhead_gear_planner.test.ts: gems after an item are skipped.
  it('skips the gem ids an item carries', () => {
    const id3 = (id: number, high = 0) => [high | (id >> 16), (id >> 8) & 255, id & 255];
    const bytes = [
      3,
      60,
      0,
      1 | 128,
      ...id3(29011, 2 << 5),
      28909 >> 8,
      28909 & 255,
      ...id3(24027),
      ...id3(24061, 1 << 5),
      16,
      ...id3(28773),
    ];
    expect(readWowheadHash(b64url(bytes)).items).toEqual([
      { slotId: 1, itemId: 29011, enchantSpellId: 28909 },
      { slotId: 16, itemId: 28773 },
    ]);
  });

  it('reads talents and stops at the third separator', () => {
    // "05002001-055000025-05032": nibbles with 15 as separator.
    const nibbles = [0, 5, 0, 0, 2, 0, 0, 1, 15, 0, 5, 5, 0, 0, 0, 0, 2, 5, 15, 0, 5, 0, 3, 2, 15];
    const packed: number[] = [];
    for (let i = 0; i < nibbles.length; i += 2) packed.push((nibbles[i]! << 4) | (nibbles[i + 1] ?? 0));
    const h = readWowheadHash(b64url([3, 60, packed.length, ...packed]));
    expect(h.talents).toBe('05002001-055000025-05032');
    expect(h.level).toBe(60);
  });

  it('reads an empty talent string as empty', () => {
    expect(readWowheadHash(b64url([3, 60, 2, 0xff, 0xf0])).talents).toBe('');
  });

  it('decodes a negative random suffix', () => {
    const h = readWowheadHash(b64url([3, 60, 0, 12 | 64, 0, 0x2e, 0xd6, 0xff, 0xfb]));
    expect(h.items).toEqual([{ slotId: 12, itemId: 11990, randomSuffix: -5 }]);
  });

  it('returns a class/race-only link with a DEFAULT-05 for gear', () => {
    const r = importAny('https://www.wowhead.com/forever/gear-planner/warlock/gnome', ctx);
    expect(r.character).toMatchObject({ class: 'warlock', race: 'gnome', spec: 'warlock', gear: {} });
    expect(r.diagnostics.find((d) => d.field === 'gear')).toMatchObject({ code: 'DEFAULT-05' });
  });

  it('warns when the hash is not base64', () => {
    const r = importAny('https://www.wowhead.com/forever/gear-planner/warlock/gnome/A', ctx);
    expect(r.character?.class).toBe('warlock');
    expect(codes(r)).toContain('PARSE-02:warning');
  });

  it('without enchantIdForSpell in the context, enchants come back as DATA-03', () => {
    const plain = { dataBuild: ctx.dataBuild, hasItem: ctx.hasItem, hasEnchant: ctx.hasEnchant };
    const url =
      'https://www.wowhead.com/forever/gear-planner/hunter/orc/' +
      b64url([3, 60, 0, 15 | 128, 0, 0x48, 0x4f, 0x34, 0x34]);
    const r = importAny(url, plain);
    expect(r.character?.gear.back).toEqual({ itemId: 18511 });
    expect(r.diagnostics.find((d) => d.code === 'DATA-03')).toMatchObject({ field: 'back' });
  });
});

describe('garbage never throws', () => {
  // Deterministic PRNG so failures reproduce.
  let seed = 0x5f1a;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const fragments = [
    'warrior="',
    'hunter=',
    '\n',
    '=',
    ',id=',
    ',enchant_id=',
    'head',
    'main_hand=',
    'talents=',
    'race=',
    'spec=',
    'level=',
    '#',
    '{',
    '}',
    '"class":',
    '"gear":{"items":[',
    'null',
    ']',
    '"mage"',
    'https://www.wowhead.com/forever/gear-planner/',
    'druid/',
    'orc/',
    'Azw',
    '-',
    '_',
    '9999999999999',
    '-1',
    '\u0000',
    '\u{1F600}',
    '\r',
    ' ',
  ];

  it('survives 3,000 random inputs through every entry point', () => {
    for (let i = 0; i < 3000; i++) {
      let s = '';
      const n = Math.floor(rand() * 40);
      for (let j = 0; j < n; j++) {
        s += rand() < 0.7 ? pick(fragments) : String.fromCharCode(Math.floor(rand() * 0x2fff));
      }
      expect(() => detectFormat(s)).not.toThrow();
      const r = importAny(s, ctx);
      expect(Array.isArray(r.diagnostics)).toBe(true);
      for (const imp of IMPORTERS) {
        expect(() => imp.detect(s)).not.toThrow();
        const out = imp.parse(s, ctx);
        expect(out.format).toBe(imp.format);
        if (out.character === null) expect(out.diagnostics.some((d) => d.severity === 'error')).toBe(true);
      }
    }
  });

  it('survives non-string input', () => {
    for (const bad of [undefined, null, 5, {}, []] as unknown as string[]) {
      expect(() => importAny(bad, ctx)).not.toThrow();
      for (const imp of IMPORTERS) expect(() => imp.parse(bad, ctx)).not.toThrow();
    }
  });
});
