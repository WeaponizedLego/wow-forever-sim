import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CharacterSchema, EngineLockSchema, ITEM_SLOTS, SPECS } from './index';

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

describe('engine.lock.json', () => {
  it('matches EngineLockSchema', () => {
    const lock = JSON.parse(readFileSync(new URL('../../../engine.lock.json', import.meta.url), 'utf8'));
    expect(() => EngineLockSchema.parse(lock)).not.toThrow();
  });
});
