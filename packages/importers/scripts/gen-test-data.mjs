// Writes fixtures/import/data-ids.json: the item ids, enchant effect ids and enchant spell → effect
// map from an upstream wowsims/forever `assets/database/db.json`. The importer tests build their
// ImportContext from it, so they do not depend on the game-data package (lane L6).
//
// Usage: node packages/importers/scripts/gen-test-data.mjs <path to db.json> <data build label>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [dbPath, dataBuild] = process.argv.slice(2);
if (!dbPath || !dataBuild) {
  console.error('usage: gen-test-data.mjs <db.json> <data build label>');
  process.exit(1);
}

const db = JSON.parse(readFileSync(dbPath, 'utf8'));
const items = db.items.map((i) => i.id).sort((a, b) => a - b);
const enchants = [...new Set(db.enchants.map((e) => e.effectId))].sort((a, b) => a - b);
const enchantSpells = Object.fromEntries(
  db.enchants.filter((e) => e.spellId).map((e) => [String(e.spellId), e.effectId]),
);

const out = fileURLToPath(new URL('../../../fixtures/import/data-ids.json', import.meta.url));
writeFileSync(out, JSON.stringify({ dataBuild, items, enchants, enchantSpells }) + '\n');
console.log(`wrote ${items.length} items, ${enchants.length} enchants to ${out}`);
