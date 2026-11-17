import { describe, expect, it } from 'vitest';
import { bossPressed, selectedBosses, toggleBoss, type BossSelection } from './boss-selection';

const ALL = ['herod', 'mograine', 'whitemane', 'thalnos'];

describe('boss chips', () => {
  it('under All, clicking a boss isolates it', () => {
    expect(toggleBoss(null, ALL, 'thalnos')).toEqual(['thalnos']);
  });

  it('then clicks add and remove bosses, in instance order', () => {
    let s: BossSelection = toggleBoss(null, ALL, 'thalnos');
    s = toggleBoss(s, ALL, 'herod');
    expect(s).toEqual(['herod', 'thalnos']);
    s = toggleBoss(s, ALL, 'thalnos');
    expect(s).toEqual(['herod']);
    s = toggleBoss(s, ALL, 'herod');
    expect(s).toEqual([]);
    expect(selectedBosses(s, ALL)).toEqual([]);
  });

  it('picking every boss is All again', () => {
    let s: BossSelection = ['herod', 'mograine', 'whitemane'];
    s = toggleBoss(s, ALL, 'thalnos');
    expect(s).toBeNull();
    expect(selectedBosses(s, ALL)).toEqual(ALL);
    // An instance with one boss: clicking it under All stays All.
    expect(toggleBoss(null, ['onyxia'], 'onyxia')).toBeNull();
  });

  it('a boss chip is pressed only when picked, not under All', () => {
    expect(ALL.map((k) => bossPressed(null, k))).toEqual([false, false, false, false]);
    expect(ALL.map((k) => bossPressed(['thalnos'], k))).toEqual([false, false, false, true]);
  });
});
