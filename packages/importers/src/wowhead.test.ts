import type { ImportResult } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { detectFormat, importAny } from './index';
import { readFixture, testContext } from './test-context';
import { parseWowheadLink, readWowheadHash } from './wowhead';
import { FOREVER_DATA_ENV, readPackedHash, writePackedHash } from './wowhead-packed';

const ctx = testContext();
const codes = (r: ImportResult) => r.diagnostics.map((d) => `${d.code}:${d.severity}`);
const b64url = (bytes: number[]) => Buffer.from(bytes).toString('base64url');

/** Captured from wowhead.com/forever/gear-planner (Wowhead rewrote the link into its own encoding). */
const REAL_LINK = readFixture('real/wowhead-forever-sv-hunter.url').trim();

describe('Wowhead link shapes', () => {
  it.each([
    ['https://www.wowhead.com/forever/gear-planner/mage/human/FQ', 'forever', 'human'],
    ['https://www.wowhead.com/forever/de/gear-planner/mage/human', 'forever', 'human'],
    ['www.wowhead.com/forever/cn/gear-planner/mage/gnome', 'forever', 'gnome'],
    ['https://www.wowhead.com/de/forever/gear-planner/mage/gnome', 'forever', 'gnome'],
    ['wowhead.com/forever/gear-planner/mage', 'forever', ''],
    ['https://www.wowhead.com/classic/gear-planner/hunter/orc/BDwAAA', 'classic', 'orc'],
    ['https://classic.wowhead.com/gear-planner/hunter/orc', 'classic', 'orc'],
    ['https://de.classic.wowhead.com/gear-planner/hunter/orc', 'classic', 'orc'],
    ['https://www.wowhead.com/tbc/gear-planner/hunter/orc', 'tbc', 'orc'],
    ['https://www.wowhead.com/gear-planner/hunter/orc', 'retail', 'orc'],
  ])('%s', (url, game, race) => {
    expect(detectFormat(`gear: ${url} (mine)`)).toBe('wowhead-url');
    expect(parseWowheadLink(url)).toMatchObject({ game, raceName: race });
  });

  it('answers a lone link to another Wowhead page with an error pointing at the planner', () => {
    for (const url of [
      'https://www.wowhead.com/forever/item=16677',
      'https://www.wowhead.com/forever/talent-calc/hunter',
    ]) {
      const r = importAny(url, ctx);
      expect(r.format).toBe('wowhead-url');
      expect(r.character).toBeNull();
      expect(r.diagnostics[0]).toMatchObject({ code: 'FMT-01', severity: 'error' });
      expect(r.diagnostics[0]?.message).toMatch(/not a gear planner link/);
    }
  });

  it('leaves Wowhead links inside other text to the other importers', () => {
    expect(detectFormat('mage="X"\n# see https://www.wowhead.com/forever/item=16677\nlevel=60')).toBe('simc');
  });
});

describe('packed hash (Forever planner, version 5)', () => {
  it('reads a real Forever planner link', () => {
    const hash = REAL_LINK.split('/').pop()!;
    const h = readPackedHash(hash);
    expect(h).toMatchObject({
      version: 5,
      dataEnv: FOREVER_DATA_ENV,
      level: 60,
      talents: '3-00510503113-52225303000021004',
      talentVersion: 'vkndmh',
    });
    expect(h.items).toHaveLength(16);
    // Enchant spell ids above 65535 fit (the byte format cut them to 2 bytes).
    expect(h.items.find((i) => i.slotId === 9)).toEqual({
      slotId: 9,
      itemId: 16681,
      enchantSpellId: 1217203,
    });
    expect(h.items.find((i) => i.slotId === 12)).toEqual({ slotId: 12, itemId: 11990, randomSuffix: 12728 });
  });

  it('matches what Wowhead itself decodes from a link it wrote', () => {
    // Wowhead's reader on this hash: talentHash "vkndmh02-00500503", Beaststalker's Cap, Selenium Loop
    // with suffix -5, Shifting Cloak with enchant spell 13882.
    expect(readPackedHash('FQBgcCCI0wIDAGvkndmhADABz0FhgMyq2LBP0QvzIa')).toEqual({
      version: 5,
      dataEnv: 16,
      level: 60,
      talents: '02-00500503',
      talentVersion: 'vkndmh',
      items: [
        { slotId: 1, itemId: 16677 },
        { slotId: 12, itemId: 11990, randomSuffix: -5 },
        { slotId: 15, itemId: 18511, enchantSpellId: 13882 },
      ],
    });
  });

  it('round-trips through the encoder, including multi-digit numbers', () => {
    const items = [
      { slotId: 1, itemId: 31 },
      { slotId: 2, itemId: 32 },
      { slotId: 3, itemId: 1055 },
      { slotId: 5, itemId: 1056, enchantSpellId: 33823 },
      { slotId: 16, itemId: 280766, enchantSpellId: 1254772, randomSuffix: -1200 },
    ];
    const hash = writePackedHash({
      dataEnv: 16,
      level: 42,
      talents: '01234501234-0-5',
      talentVersion: 'vkndmh',
      items,
      legacy: 'abc',
    });
    expect(hash[0]).toBe('F');
    expect(readPackedHash(hash)).toEqual({
      version: 5,
      dataEnv: 16,
      level: 42,
      talents: '01234501234-0-5',
      talentVersion: 'vkndmh',
      items,
    });
  });

  it('reports a version it does not know without reading on', () => {
    expect(readPackedHash('GQBgc')).toEqual({ version: 6, dataEnv: 0, talents: '', items: [] });
    const r = importAny('https://www.wowhead.com/forever/gear-planner/mage/human/GQBgc', ctx);
    expect(r.character?.class).toBe('mage');
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ code: 'PARSE-02', field: 'gear' }));
  });

  it('throws on characters outside base64url, which the importer turns into a warning', () => {
    expect(() => readPackedHash('FQ$')).toThrow();
  });

  it('survives truncated hashes', () => {
    for (let n = 1; n < REAL_LINK.length; n += 7) {
      const hash = REAL_LINK.split('/').pop()!.slice(0, n);
      expect(() => readWowheadHash(hash)).not.toThrow();
    }
  });
});

describe('byte hash version 4 (Classic Era planner)', () => {
  it('reads 3-byte item ids and values', () => {
    // Shifting Cloak with enchant spell 13882, Selenium Loop with suffix 5. Wowhead's Classic planner
    // rewrote this into BDwAAEwALtYAAAWPAEhPADY6 (same items, sorted by slot).
    const bytes = [4, 60, 0, 0, 12 | 64, 0, 0x2e, 0xd6, 0, 0, 5, 15 | 128, 0, 0x48, 0x4f, 0, 0x36, 0x3a];
    expect(readWowheadHash(b64url(bytes))).toEqual({
      version: 4,
      level: 60,
      talents: '',
      items: [
        { slotId: 12, itemId: 11990, randomSuffix: 5 },
        { slotId: 15, itemId: 18511, enchantSpellId: 13882 },
      ],
    });
    expect(readWowheadHash('BDwAAEwALtYAAAWPAEhPADY6').items).toHaveLength(2);
  });
});

describe('Wowhead import', () => {
  it('imports the real Forever planner link with every enchant resolved', () => {
    const r = importAny(REAL_LINK, ctx);
    expect(r.format).toBe('wowhead-url');
    expect(r.character).toMatchObject({
      class: 'hunter',
      race: 'orc',
      level: 60,
      talents: '3-00510503113-52225303000021004',
    });
    expect(Object.keys(r.character!.gear)).toHaveLength(16);
    expect(r.character!.gear.wrist).toEqual({ itemId: 16681, enchantId: 7656 });
    expect(r.character!.gear.legs).toEqual({ itemId: 16678, enchantId: 8491 });
    expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('reads a localized link the same way', () => {
    const de = importAny(REAL_LINK.replace('/forever/', '/forever/de/'), ctx);
    expect(de.character).toEqual(importAny(REAL_LINK, ctx).character);
  });

  it('notes a Classic Era planner link', () => {
    const r = importAny(
      'https://www.wowhead.com/classic/gear-planner/hunter/orc/BDwAAEwALtYAAAWPAEhPADY6',
      ctx,
    );
    expect(r.character?.gear.back).toMatchObject({ itemId: 18511 });
    expect(r.character?.gear.finger2).toEqual({ itemId: 11990, randomSuffix: 5 });
    expect(r.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'PARSE-02', severity: 'info', field: 'gear' }),
    );
  });

  it('warns on other games and skips retail gear', () => {
    expect(codes(importAny('https://www.wowhead.com/tbc/gear-planner/hunter/orc', ctx))).toContain(
      'PARSE-02:warning',
    );
    const retail = importAny('https://www.wowhead.com/gear-planner/hunter/orc/AAAA', ctx);
    expect(retail.character?.gear).toEqual({});
    expect(retail.diagnostics[0]).toMatchObject({ code: 'PARSE-02', severity: 'warning' });
  });

  it('takes a class-only link, filling race from the class default', () => {
    const r = importAny('https://www.wowhead.com/forever/gear-planner/hunter', ctx);
    expect(r.character?.class).toBe('hunter');
    expect(r.diagnostics.find((d) => d.field === 'race')).toMatchObject({ code: 'DEFAULT-05' });
  });
});
