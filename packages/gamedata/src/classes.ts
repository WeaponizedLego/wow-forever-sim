// What each class may wear, wield and be. Mirrors upstream ui/sim/player/classes/capabilities_auto_gen.ts at the
// pinned commit (generated there from the game data by tools/database/gen_character_constants_ts.go).
import type { ClassId, RaceId } from '@fsim/contracts';
import { ArmorType, RangedWeaponType, WeaponType } from '@fsim/proto/common';

/** The heaviest armor each class wears; it wears every lighter type too. */
export const CLASS_MAX_ARMOR: Record<ClassId, ArmorType> = {
  warrior: ArmorType.ArmorTypePlate,
  paladin: ArmorType.ArmorTypePlate,
  hunter: ArmorType.ArmorTypeMail,
  rogue: ArmorType.ArmorTypeLeather,
  priest: ArmorType.ArmorTypeCloth,
  shaman: ArmorType.ArmorTypeMail,
  mage: ArmorType.ArmorTypeCloth,
  warlock: ArmorType.ArmorTypeCloth,
  druid: ArmorType.ArmorTypeLeather,
};

const W = WeaponType;
/** Weapon types each class wields, and whether it may wield the two-handed kind. */
export const CLASS_WEAPON_TYPES: Record<ClassId, ReadonlyMap<WeaponType, { twoHand: boolean }>> = {
  warrior: weapons(
    [W.WeaponTypeAxe, W.WeaponTypeMace, W.WeaponTypePolearm, W.WeaponTypeStaff, W.WeaponTypeSword],
    [W.WeaponTypeDagger, W.WeaponTypeFist, W.WeaponTypeOffHand, W.WeaponTypeShield],
  ),
  paladin: weapons(
    [W.WeaponTypeAxe, W.WeaponTypeMace, W.WeaponTypePolearm, W.WeaponTypeSword],
    [W.WeaponTypeOffHand, W.WeaponTypeShield],
  ),
  hunter: weapons(
    [W.WeaponTypeAxe, W.WeaponTypePolearm, W.WeaponTypeStaff, W.WeaponTypeSword],
    [W.WeaponTypeDagger, W.WeaponTypeFist],
  ),
  rogue: weapons(
    [],
    [
      W.WeaponTypeAxe,
      W.WeaponTypeDagger,
      W.WeaponTypeFist,
      W.WeaponTypeMace,
      W.WeaponTypeOffHand,
      W.WeaponTypeSword,
    ],
  ),
  priest: weapons([W.WeaponTypeStaff], [W.WeaponTypeDagger, W.WeaponTypeMace, W.WeaponTypeOffHand]),
  shaman: weapons(
    [W.WeaponTypeAxe, W.WeaponTypeMace, W.WeaponTypeStaff],
    [W.WeaponTypeDagger, W.WeaponTypeFist, W.WeaponTypeOffHand, W.WeaponTypeShield],
  ),
  mage: weapons([W.WeaponTypeStaff], [W.WeaponTypeDagger, W.WeaponTypeOffHand, W.WeaponTypeSword]),
  warlock: weapons([W.WeaponTypeStaff], [W.WeaponTypeDagger, W.WeaponTypeOffHand, W.WeaponTypeSword]),
  druid: weapons(
    [W.WeaponTypeMace, W.WeaponTypePolearm, W.WeaponTypeStaff],
    [W.WeaponTypeDagger, W.WeaponTypeFist, W.WeaponTypeOffHand],
  ),
};

function weapons(
  twoHand: WeaponType[],
  oneHandOnly: WeaponType[],
): ReadonlyMap<WeaponType, { twoHand: boolean }> {
  return new Map<WeaponType, { twoHand: boolean }>([
    ...twoHand.map((t): [WeaponType, { twoHand: boolean }] => [t, { twoHand: true }]),
    ...oneHandOnly.map((t): [WeaponType, { twoHand: boolean }] => [t, { twoHand: false }]),
  ]);
}

const R = RangedWeaponType;
export const CLASS_RANGED_TYPES: Record<ClassId, readonly RangedWeaponType[]> = {
  warrior: [
    R.RangedWeaponTypeBow,
    R.RangedWeaponTypeCrossbow,
    R.RangedWeaponTypeGun,
    R.RangedWeaponTypeThrown,
  ],
  paladin: [R.RangedWeaponTypeLibram],
  hunter: [R.RangedWeaponTypeBow, R.RangedWeaponTypeCrossbow, R.RangedWeaponTypeGun],
  rogue: [R.RangedWeaponTypeBow, R.RangedWeaponTypeCrossbow, R.RangedWeaponTypeGun, R.RangedWeaponTypeThrown],
  priest: [R.RangedWeaponTypeWand],
  shaman: [R.RangedWeaponTypeTotem],
  mage: [R.RangedWeaponTypeWand],
  warlock: [R.RangedWeaponTypeWand],
  druid: [R.RangedWeaponTypeIdol],
};

/** Races each class may be, in upstream order; the first is the class default when a preset names none. */
export const CLASS_RACES: Record<ClassId, readonly RaceId[]> = {
  warrior: [
    'human',
    'dwarf',
    'nightelf',
    'gnome',
    'highorderskyborne',
    'orc',
    'undead',
    'tauren',
    'troll',
    'windshaperskyborne',
  ],
  paladin: ['human', 'dwarf', 'undead'],
  hunter: ['human', 'dwarf', 'nightelf', 'highorderskyborne', 'orc', 'tauren', 'troll', 'windshaperskyborne'],
  rogue: [
    'human',
    'dwarf',
    'nightelf',
    'gnome',
    'highorderskyborne',
    'orc',
    'undead',
    'troll',
    'windshaperskyborne',
  ],
  priest: ['human', 'dwarf', 'nightelf', 'gnome', 'undead', 'troll'],
  shaman: ['dwarf', 'orc', 'tauren', 'troll', 'windshaperskyborne'],
  mage: ['human', 'gnome', 'highorderskyborne', 'orc', 'undead', 'troll'],
  warlock: ['human', 'gnome', 'orc', 'undead', 'troll'],
  druid: ['nightelf', 'highorderskyborne', 'tauren', 'windshaperskyborne'],
};
