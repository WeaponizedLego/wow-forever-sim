// Class and item quality colors. Values match apps/web/app/assets/css/tokens.css (--class-*, --quality-*).
import type { ClassId } from '@fsim/contracts';
import { ItemQuality } from '@fsim/proto/common';

export const CLASS_COLORS: Record<ClassId, string> = {
  druid: '#ff7c0a',
  hunter: '#aad372',
  mage: '#3fc7eb',
  paladin: '#f48cba',
  priest: '#ffffff',
  rogue: '#fff468',
  shaman: '#0070dd',
  warlock: '#8788ee',
  warrior: '#c69b6d',
};

/** The CSS custom property for a class color, for templates that should follow the tokens. */
export const classColorVar = (c: ClassId): string => `var(--class-${c})`;

/** Item quality text colors. Junk uses --text-3 (no quality token); artifact and heirloom use legendary's. */
export const ITEM_QUALITY_COLORS: Record<ItemQuality, string> = {
  [ItemQuality.ItemQualityJunk]: '#868b93',
  [ItemQuality.ItemQualityCommon]: '#ecedee',
  [ItemQuality.ItemQualityUncommon]: '#3fd15a',
  [ItemQuality.ItemQualityRare]: '#3d8ff0',
  [ItemQuality.ItemQualityEpic]: '#b65cf2',
  [ItemQuality.ItemQualityLegendary]: '#ff8a1f',
  [ItemQuality.ItemQualityArtifact]: '#ff8a1f',
  [ItemQuality.ItemQualityHeirloom]: '#ff8a1f',
};

const QUALITY_VARS: Partial<Record<ItemQuality, string>> = {
  [ItemQuality.ItemQualityCommon]: 'common',
  [ItemQuality.ItemQualityUncommon]: 'uncommon',
  [ItemQuality.ItemQualityRare]: 'rare',
  [ItemQuality.ItemQualityEpic]: 'epic',
  [ItemQuality.ItemQualityLegendary]: 'legendary',
  [ItemQuality.ItemQualityArtifact]: 'legendary',
  [ItemQuality.ItemQualityHeirloom]: 'legendary',
};

/** The CSS custom property for a quality color. */
export const qualityColorVar = (q: ItemQuality): string =>
  QUALITY_VARS[q] ? `var(--quality-${QUALITY_VARS[q]})` : 'var(--text-3)';
