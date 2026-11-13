// Which slots an item or enchant fits and whether a class or spec may equip it.
// Ports upstream ui/sim/proto/items.ts (getEligibleItemSlots, getEligibleEnchantSlots, enchantAppliesToItem,
// canEquipItem) at the pinned commit.
import { CLASSES, ITEM_SLOTS, type ClassId, type ItemSlotId, type SpecId } from '@fsim/contracts';
import {
  Class,
  EnchantType,
  HandType,
  ItemSlot,
  ItemType,
  RangedWeaponType,
  WeaponType,
} from '@fsim/proto/common';
import type { UIEnchant, UIItem } from '@fsim/proto/ui';
import { CLASS_MAX_ARMOR, CLASS_RANGED_TYPES, CLASS_WEAPON_TYPES } from './classes';
import { DUAL_WIELD_SPECS } from './specs';

const S = ItemSlot;
const ITEM_TYPE_TO_SLOTS: Partial<Record<ItemType, readonly ItemSlot[]>> = {
  [ItemType.ItemTypeHead]: [S.ItemSlotHead],
  [ItemType.ItemTypeNeck]: [S.ItemSlotNeck],
  [ItemType.ItemTypeShoulder]: [S.ItemSlotShoulder],
  [ItemType.ItemTypeBack]: [S.ItemSlotBack],
  [ItemType.ItemTypeChest]: [S.ItemSlotChest],
  [ItemType.ItemTypeWrist]: [S.ItemSlotWrist],
  [ItemType.ItemTypeHands]: [S.ItemSlotHands],
  [ItemType.ItemTypeWaist]: [S.ItemSlotWaist],
  [ItemType.ItemTypeLegs]: [S.ItemSlotLegs],
  [ItemType.ItemTypeFeet]: [S.ItemSlotFeet],
  [ItemType.ItemTypeFinger]: [S.ItemSlotFinger1, S.ItemSlotFinger2],
  [ItemType.ItemTypeTrinket]: [S.ItemSlotTrinket1, S.ItemSlotTrinket2],
  [ItemType.ItemTypeRanged]: [S.ItemSlotRanged],
};

/** The contract slot id for an engine ItemSlot (the index into ITEM_SLOTS). */
export const slotId = (slot: ItemSlot): ItemSlotId => ITEM_SLOTS[slot]!;
/** The engine ItemSlot for a contract slot id. */
export const slotProto = (slot: ItemSlotId): ItemSlot => ITEM_SLOTS.indexOf(slot) as ItemSlot;

/** Slots the item can go in, ignoring who wears it. */
export function itemSlots(item: Pick<UIItem, 'type' | 'handType'>): readonly ItemSlot[] {
  const fixed = ITEM_TYPE_TO_SLOTS[item.type];
  if (fixed) return fixed;
  if (item.type === ItemType.ItemTypeWeapon) {
    if (item.handType === HandType.HandTypeMainHand) return [S.ItemSlotMainHand];
    if (item.handType === HandType.HandTypeOffHand) return [S.ItemSlotOffHand];
    return [S.ItemSlotMainHand, S.ItemSlotOffHand];
  }
  return [];
}

/** Slots the enchant can go on. */
export function enchantSlots(enchant: Pick<UIEnchant, 'type' | 'extraTypes'>): ItemSlot[] {
  return [enchant.type, ...enchant.extraTypes].flatMap((type) => {
    const fixed = ITEM_TYPE_TO_SLOTS[type];
    if (fixed) return fixed;
    if (type === ItemType.ItemTypeWeapon) return [S.ItemSlotMainHand, S.ItemSlotOffHand];
    return [];
  });
}

/** Whether the enchant can be applied to this item (upstream enchantAppliesToItem). */
export function enchantAppliesToItem(enchant: UIEnchant, item: UIItem): boolean {
  const itemSlotSet = itemSlots(item);
  if (!enchantSlots(enchant).some((s) => itemSlotSet.includes(s))) return false;
  const et = enchant.enchantType;
  if (et === EnchantType.EnchantTypeTwoHand && item.handType !== HandType.HandTypeTwoHand) return false;
  if (et === EnchantType.EnchantTypeStaff && item.weaponType !== WeaponType.WeaponTypeStaff) return false;
  if (et === EnchantType.EnchantTypeShield && item.weaponType !== WeaponType.WeaponTypeShield) return false;
  if ((et === EnchantType.EnchantTypeOffHand) !== (item.weaponType === WeaponType.WeaponTypeOffHand))
    return false;
  if (item.weaponType === WeaponType.WeaponTypeShield && et !== EnchantType.EnchantTypeShield) return false;
  if (enchant.type === ItemType.ItemTypeRanged) {
    const r = item.rangedWeaponType;
    if (
      r !== RangedWeaponType.RangedWeaponTypeBow &&
      r !== RangedWeaponType.RangedWeaponTypeCrossbow &&
      r !== RangedWeaponType.RangedWeaponTypeGun
    ) {
      return false;
    }
  }
  if (
    item.rangedWeaponType !== RangedWeaponType.RangedWeaponTypeWand &&
    item.rangedWeaponType > 0 &&
    enchant.type !== ItemType.ItemTypeRanged
  ) {
    return false;
  }
  return true;
}

const classProto = (c: ClassId): Class => CLASSES[c].proto as Class;

/**
 * Whether a class (and, for off-hand weapons, a spec) may equip the item in `slot` (upstream canEquipItem).
 * Without a spec, dual wielding counts as allowed when any spec of the class may dual wield.
 */
export function canEquip(
  item: UIItem,
  who: { class: ClassId; spec?: SpecId | undefined },
  slot?: ItemSlot,
): boolean {
  if (item.classAllowlist.length > 0 && !item.classAllowlist.includes(classProto(who.class))) return false;
  if (item.type === ItemType.ItemTypeFinger || item.type === ItemType.ItemTypeTrinket) return true;
  if (item.type === ItemType.ItemTypeWeapon) {
    const allowed = CLASS_WEAPON_TYPES[who.class].get(item.weaponType);
    if (!allowed) return false;
    const offHandWeapon =
      item.handType === HandType.HandTypeOffHand ||
      (item.handType === HandType.HandTypeOneHand && slot === S.ItemSlotOffHand);
    const holdable =
      item.weaponType === WeaponType.WeaponTypeShield || item.weaponType === WeaponType.WeaponTypeOffHand;
    if (offHandWeapon && !holdable && !canDualWield(who)) return false;
    if (item.handType === HandType.HandTypeTwoHand && (!allowed.twoHand || slot === S.ItemSlotOffHand)) {
      return false;
    }
    return true;
  }
  if (item.type === ItemType.ItemTypeRanged)
    return CLASS_RANGED_TYPES[who.class].includes(item.rangedWeaponType);
  return CLASS_MAX_ARMOR[who.class] >= item.armorType;
}

const DUAL_WIELD_CLASSES: ReadonlySet<ClassId> = new Set(['warrior', 'hunter', 'rogue']);
const canDualWield = (who: { class: ClassId; spec?: SpecId | undefined }) =>
  who.spec ? DUAL_WIELD_SPECS.has(who.spec) : DUAL_WIELD_CLASSES.has(who.class);
