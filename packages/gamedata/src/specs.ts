import type { SpecId } from '@fsim/contracts';

/**
 * The `Player.spec` oneof arm of each engine spec (protobuf-ts camelCase field name). Its value holds the spec's
 * `options` message, which `Character.specOptions` carries as protojson.
 */
export const SPEC_ONEOF = {
  'balance-druid': 'balanceDruid',
  'feral-cat-druid': 'feralCatDruid',
  'feral-bear-druid': 'feralBearDruid',
  'restoration-druid': 'restorationDruid',
  hunter: 'hunter',
  mage: 'mage',
  'holy-paladin': 'holyPaladin',
  'protection-paladin': 'protectionPaladin',
  'retribution-paladin': 'retributionPaladin',
  'dps-priest': 'dpsPriest',
  'healer-priest': 'healerPriest',
  rogue: 'rogue',
  'elemental-shaman': 'elementalShaman',
  'enhancement-shaman': 'enhancementShaman',
  'restoration-shaman': 'restorationShaman',
  warlock: 'warlock',
  'dps-warrior': 'dpsWarrior',
  'protection-warrior': 'protectionWarrior',
} as const satisfies Record<SpecId, string>;

export type SpecOneofKind = (typeof SPEC_ONEOF)[SpecId];

/** Specs that may dual wield (upstream `SPEC_CAN_DUAL_WIELD`). */
export const DUAL_WIELD_SPECS: ReadonlySet<SpecId> = new Set<SpecId>([
  'hunter',
  'rogue',
  'dps-warrior',
  'protection-warrior',
]);
