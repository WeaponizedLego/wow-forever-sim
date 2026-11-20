import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CharacterSchema,
  EncounterSchema,
  EngineLockSchema,
  FIGHT_STYLE_IDS,
  FIGHT_STYLES,
  fightStyle,
  ITEM_SLOTS,
  SPECS,
} from './index';

describe('game vocabulary', () => {
  it('has one entry per engine spec with unique ids and proto values', () => {
    expect(SPECS).toHaveLength(18);
    expect(new Set(SPECS.map((s) => s.id)).size).toBe(18);
    expect(new Set(SPECS.map((s) => s.proto)).size).toBe(18);
  });

  it('lists gear slots in engine ItemSlot order', () => {
    expect(ITEM_SLOTS).toHaveLength(17);
    expect(ITEM_SLOTS[0]).toBe('head');
    expect(ITEM_SLOTS[16]).toBe('ranged');
  });
});

describe('CharacterSchema', () => {
  it('fills defaults for a minimal character', () => {
    const c = CharacterSchema.parse({
      class: 'hunter',
      spec: 'hunter',
      race: 'orc',
      gear: { head: { itemId: 16939 } },
      talents: '5320001505101251-0052050301-4',
      rotation: { kind: 'preset', presetId: 'sv' },
    });
    expect(c.level).toBe(60);
    expect(c.buffs).toBe('full-raid');
    expect(c.encounter.durationSec).toBe(180);
  });

  it('keeps a preset rotation’s changed settings, and has none when nothing was changed', () => {
    const hunter = { class: 'hunter', spec: 'hunter', race: 'orc', gear: {}, talents: '' };
    const rotation = { kind: 'preset', presetId: 'turret', switches: { 'Use Summon Hawk': true } };
    expect(CharacterSchema.parse({ ...hunter, rotation }).rotation).toEqual(rotation);
    const plain = CharacterSchema.parse({ ...hunter, rotation: { kind: 'preset', presetId: 'turret' } });
    expect(plain.rotation).toEqual({ kind: 'preset', presetId: 'turret' });
    const bad = { ...rotation, switches: { 'Use Summon Hawk': 'yes' } };
    expect(CharacterSchema.safeParse({ ...hunter, rotation: bad }).success).toBe(false);

    const numbers = { ...rotation, values: { 'Shoot spot': 14.5 } };
    expect(CharacterSchema.parse({ ...hunter, rotation: numbers }).rotation).toEqual(numbers);
    for (const v of [-1, '15'])
      expect(
        CharacterSchema.safeParse({ ...hunter, rotation: { ...rotation, values: { 'Shoot spot': v } } })
          .success,
      ).toBe(false);
  });

  it('rejects an unknown spec', () => {
    const r = CharacterSchema.safeParse({
      class: 'warrior',
      spec: 'fury',
      race: 'orc',
      gear: {},
      talents: '',
      rotation: { kind: 'preset', presetId: 'x' },
    });
    expect(r.success).toBe(false);
  });
});

describe('Encounter fight styles', () => {
  const minimal = {
    class: 'hunter',
    spec: 'hunter',
    race: 'orc',
    gear: {},
    talents: '',
    rotation: { kind: 'preset', presetId: 'sv' },
  };

  it('a new character fights Patchwerk 3 min, with the values the app always defaulted to', () => {
    expect(CharacterSchema.parse(minimal).encounter).toEqual({
      style: 'patchwerk-3m',
      durationSec: 180,
      durationVariationSec: 5,
      targetCount: 1,
      targetLevel: 63,
      executePhase: true,
    });
  });

  it('an encounter saved before fight styles is Custom with its own values', () => {
    const e = EncounterSchema.parse({ durationSec: 240, targetCount: 3 });
    expect(e).toEqual({
      style: 'custom',
      durationSec: 240,
      durationVariationSec: 5,
      targetCount: 3,
      targetLevel: 63,
      executePhase: true,
    });
  });

  it('…except the old defaults, which are Patchwerk 3 min (the same fight)', () => {
    expect(EncounterSchema.parse({}).style).toBe('patchwerk-3m');
    expect(
      EncounterSchema.parse({
        durationSec: 180,
        durationVariationSec: 5,
        targetCount: 1,
        targetLevel: 63,
        executePhase: true,
      }).style,
    ).toBe('patchwerk-3m');
    expect(EncounterSchema.parse({ executePhase: false }).style).toBe('custom');
  });

  it('a preset style fixes every field; Custom keeps them', () => {
    const stale = { durationSec: 42, durationVariationSec: 1, targetCount: 4, targetLevel: 60 };
    for (const s of FIGHT_STYLES) {
      const e = EncounterSchema.parse({ ...stale, style: s.id });
      if (s.values) expect(e).toEqual({ style: s.id, ...s.values });
      else expect(e).toMatchObject(stale);
    }
  });

  it('rejects an unknown style', () => {
    expect(EncounterSchema.safeParse({ style: 'raid-night' }).success).toBe(false);
  });

  it('the table has every style once, and a dungeon slice that fits its own values', () => {
    expect(FIGHT_STYLES.map((s) => s.id)).toEqual([...FIGHT_STYLE_IDS]);
    const slice = fightStyle('dungeon-slice-5m');
    expect(slice.segments.at(-1)!.endSec).toBe(slice.values!.durationSec);
    expect(Math.max(...slice.segments.map((s) => s.mobs))).toBe(slice.values!.targetCount);
  });
});

describe('engine.lock.json', () => {
  it('matches EngineLockSchema', () => {
    const lock = JSON.parse(readFileSync(new URL('../../../engine.lock.json', import.meta.url), 'utf8'));
    expect(() => EngineLockSchema.parse(lock)).not.toThrow();
  });
});
