import { describe, expect, it } from 'vitest';
import { CharacterSchema } from '@fsim/contracts';
import {
  MAX_VARIANT_NAME,
  VARIANT_ROW_VERSION,
  cleanVariantName,
  nextVariantName,
  readVariantRow,
  readVariantRows,
  toVariantRow,
  type WorkbenchVariant,
} from './variant-record';

const character = CharacterSchema.parse({
  name: 'Testshaman',
  class: 'shaman',
  spec: 'elemental-shaman',
  race: 'orc',
  gear: { head: { itemId: 10504 }, mainHand: { itemId: 12784, enchantId: 1900 } },
  talents: '25003105-5052032501-05',
  consumables: { flaskId: 13512 },
  rotation: { kind: 'preset', presetId: 'default' },
});

const variant: WorkbenchVariant = {
  id: 'b0f0c3a6-0000-4000-8000-000000000001',
  name: 'Trinket A',
  createdAt: '2026-11-17T10:00:00.000Z',
  fromRunId: '#0004',
  character,
  changes: 2,
  estimate: { delta: 4.2, ci95: 1.1 },
};

describe('variant rows', () => {
  it('round-trips a variant through its stored row', () => {
    const row = toVariantRow(variant);
    expect(row.v).toBe(VARIANT_ROW_VERSION);
    // JSON-safe: what IndexedDB stores is exactly what JSON can carry.
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
    const back = readVariantRow(structuredClone(row));
    expect(back).toEqual({ ok: true, variant });
  });

  it('keeps the lineage of a variant; one saved before lineages has none', () => {
    const withLineage = { ...variant, lineageId: 'lineage-a' };
    expect(readVariantRow(toVariantRow(withLineage))).toEqual({ ok: true, variant: withLineage });
    const r = readVariantRow(toVariantRow(variant));
    expect(r.ok && 'lineageId' in r.variant).toBe(false);
  });

  it('reads a row saved before the schema had today’s defaults: missing fields get them', () => {
    // A character as an older build stored it: no level, buffs, encounter, consumables, options.
    const stale = {
      id: 'old-1',
      name: 'Old',
      createdAt: '2026-11-01T00:00:00.000Z',
      fromRunId: null,
      changes: 0,
      estimate: null,
      character: {
        class: 'shaman',
        spec: 'elemental-shaman',
        race: 'orc',
        gear: { head: { itemId: 10504 } },
        talents: '',
        rotation: { kind: 'preset', presetId: 'default' },
      },
    };
    const r = readVariantRow(stale);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.variant.character.level).toBe(60);
    expect(r.variant.character.buffs).toBe('full-raid');
    expect(r.variant.character.encounter.durationSec).toBe(180);
    expect(r.variant.character.consumables).toEqual({});
  });

  it('reads a row from a newer build: unknown fields are dropped, not fatal', () => {
    const newer = {
      ...toVariantRow(variant),
      v: 7,
      pinned: true,
      character: { ...character, fightStyle: 'x' },
    };
    const r = readVariantRow(newer);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.variant.character).toEqual(character);
  });

  it('fills odd metadata with safe values', () => {
    const r = readVariantRow({
      id: 'x',
      name: '   ',
      character,
      changes: 'many',
      estimate: { delta: 'a', ci95: 1 },
      fromRunId: 4,
    });
    expect(r).toEqual({
      ok: true,
      variant: {
        id: 'x',
        name: 'Unnamed variant',
        createdAt: '',
        fromRunId: null,
        character,
        changes: 0,
        estimate: null,
      },
    });
  });

  it('reports rows it cannot read instead of throwing', () => {
    expect(readVariantRow(null)).toEqual({
      ok: false,
      unreadable: { id: '', name: 'Unnamed variant', reason: 'no id' },
    });
    expect(readVariantRow('junk').ok).toBe(false);
    const bad = readVariantRow({ id: 'b', name: 'Broken', character: { ...character, spec: 'fury' } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.unreadable.id).toBe('b');
      expect(bad.unreadable.name).toBe('Broken');
      expect(bad.unreadable.reason).toMatch(/^spec: /);
    }
  });

  it('splits a stored list into readable (newest first) and unreadable', () => {
    const older = { ...toVariantRow(variant), id: 'a', createdAt: '2026-11-01T00:00:00.000Z' };
    const newer = { ...toVariantRow(variant), id: 'c', createdAt: '2026-11-20T00:00:00.000Z' };
    const { variants, unreadable } = readVariantRows([older, { id: 'z', character: {} }, newer]);
    expect(variants.map((v) => v.id)).toEqual(['c', 'a']);
    expect(unreadable.map((u) => u.id)).toEqual(['z']);
  });
});

describe('variant names', () => {
  it('cleans whitespace and caps the length', () => {
    expect(cleanVariantName('  Two   words \n')).toBe('Two words');
    expect(cleanVariantName('x'.repeat(100))).toHaveLength(MAX_VARIANT_NAME);
  });

  it('numbers new variants with the lowest free number', () => {
    expect(nextVariantName([])).toBe('Variant 1');
    expect(nextVariantName(['Variant 1', 'Variant 3', 'Trinket A'])).toBe('Variant 2');
  });
});
