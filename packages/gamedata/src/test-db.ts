// Test helper: the fixture database, decoded once per test file.
import { readFileSync } from 'node:fs';
import { loadDatabase, type GameDatabase } from './database';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../../fixtures/gamedata/${name}`, import.meta.url)));

let db: GameDatabase | undefined;
export const fixtureDb = (): GameDatabase =>
  (db ??= loadDatabase(fixture('db.bin'), fixture('leftover_db.bin')));
export const fixtureBytes = fixture;
