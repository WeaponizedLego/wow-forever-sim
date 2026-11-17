import { describe, expect, it } from 'vitest';
import { buildSpellNames, loadSpellNames } from './spell-names';
import { fixtureDb } from './test-db';

// Every spell id in the level 42 Enhancement shaman's ability and aura metrics (fixtures/import/real), from a
// 200-iteration run of the locked engine.
const SHAMAN_ACTIONS = [
  10438, 29228, 16356, 16316, 20871, 10605, 408345, 10442, 10497, 16342, 439440, 16353, 20594, 15207, 16387,
  10627, 10472, 17364, 2860, 10587, 25361, 10413, 16362, 10610, 10392, 15208, 10432, 25359, 36936, 10444,
  10614, 26363, 10479, 10414, 10448, 10473,
];
const SHAMAN_AURAS = [
  20594, 1309422, 1270478, 16257, 1238931, 10157, 9885, 10938, 10441, 10612, 10614, 11551, 24932, 25898,
  25782, 22755, 10432, 10587, 10438, 16387, 10477, 25362, 10626, 25360, 10494, 16362, 16342, 16356, 16316,
  14325, 20355, 1311680, 11717, 9907, 11198, 11597, 11374, 17364, 10448, 29228,
];

describe('spell names', () => {
  it('prefers spellIcons and borrows an icon by name for extracted spells', () => {
    const names = buildSpellNames(
      [
        { id: 1, name: 'Windfury Weapon', icon: 'spell_nature_cyclone', rank: 1 },
        { id: 2, name: 'Stormstrike', icon: 'ability_shaman_stormstrike', rank: 0 },
      ],
      [
        [2, 'Wrong name', 0],
        [439440, 'Windfury Weapon', 1],
        [99, 'Mystery Proc', 0],
      ],
    );
    expect(names.get(2)).toEqual({ name: 'Stormstrike', rank: 0, icon: 'ability_shaman_stormstrike' });
    expect(names.get(439440)).toEqual({ name: 'Windfury Weapon', rank: 1, icon: 'spell_nature_cyclone' });
    expect(names.get(99)).toEqual({ name: 'Mystery Proc', rank: 0, icon: '' });
    expect(names.get(3)).toBeUndefined();
  });

  it('names every spell in the shaman run from offline data', async () => {
    const names = buildSpellNames(fixtureDb().raw.spellIcons, await loadSpellNames());
    const missing = [...SHAMAN_ACTIONS, ...SHAMAN_AURAS].filter((id) => !names.get(id)?.name);
    expect(missing).toEqual([]);
    // The QA case: Windfury Weapon's strike, ~18% of the shaman's damage, is not in spellIcons.
    expect(fixtureDb().raw.spellIcons.some((s) => s.id === 439440)).toBe(false);
    expect(names.get(439440)?.name).toBe('Windfury Weapon');
    expect(names.get(17364)?.name).toBe('Stormstrike');
    expect(names.get(439440)?.icon).not.toBe('');
  });
});
