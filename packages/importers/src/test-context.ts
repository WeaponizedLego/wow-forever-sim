// Test helper: an ImportContext backed by fixtures/import/data-ids.json, which holds the ids from an
// upstream wowsims/forever db.json (regenerate with scripts/gen-test-data.mjs). Kept independent
// of the game-data package so this lane's tests stand alone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WowheadImportContext } from './build';

export const FIXTURES = fileURLToPath(new URL('../../../fixtures/import/', import.meta.url));

export const readFixture = (name: string): string => readFileSync(FIXTURES + name, 'utf8');

interface DataIds {
  dataBuild: string;
  items: number[];
  enchants: number[];
  enchantSpells: Record<string, number>;
}

/**
 * The engine's hunter pet types, read from the pinned hunter.proto (every value of `enum PetType` but the zero
 * one), so these tests follow the engine without depending on the generated types.
 */
export function protoPetTypes(): string[] {
  const proto = readFileSync(
    fileURLToPath(new URL('../../proto/proto/hunter.proto', import.meta.url)),
    'utf8',
  );
  const body = /enum PetType \{([^}]*)\}/.exec(proto)?.[1] ?? '';
  return [...body.matchAll(/^\s*(\w+)\s*=\s*(\d+)\s*;/gm)].filter((m) => m[2] !== '0').map((m) => m[1]!);
}

export function testContext(): WowheadImportContext {
  const data = JSON.parse(readFixture('data-ids.json')) as DataIds;
  const items = new Set(data.items);
  const enchants = new Set(data.enchants);
  return {
    dataBuild: data.dataBuild,
    hasItem: (id) => items.has(id),
    hasEnchant: (id) => enchants.has(id),
    enchantIdForSpell: (spellId) => data.enchantSpells[String(spellId)],
    hunterPetTypes: protoPetTypes(),
  };
}
