// Test helpers: fixture loading and the vendored engine. Not exported from the package.
import { RaidSimRequest, RaidSimResult, StatWeightsRequest } from '@fsim/proto/api';
import { UIDatabase } from '@fsim/proto/ui';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VENDOR_DIR, hasVendorEngine } from '../node';

const fixtureDir = fileURLToPath(new URL('../../../../fixtures/engine/', import.meta.url));
const json = (name: string) => readFileSync(`${fixtureDir}${name}`, 'utf8');
const opts = { ignoreUnknownFields: true };

export const loadRaidSimRequest = () => RaidSimRequest.fromJsonString(json('sv-raidsim-request.json'), opts);
export const loadRaidSimResult = () => RaidSimResult.fromJsonString(json('sv-raidsim-result.json'), opts);
export const loadStatWeightsRequest = () =>
  StatWeightsRequest.fromJsonString(json('sv-statweights-request.json'), opts);

/** The fixture's expected mean DPS (5,000 iterations, seed 0x5F1A). */
export const FIXTURE_DPS = 850.196788593879;

export const VENDOR_MISSING = hasVendorEngine()
  ? ''
  : `No engine in ${VENDOR_DIR}: run \`node packages/engine/scripts/build-local.mjs --src <wowsims/forever checkout>\`. Skipping WASM tests.`;

export const hasVendorDb = () => existsSync(`${VENDOR_DIR}db.bin`);

/**
 * Upstream's db.bin merged with leftover_db.bin, as upstream's Go loader does. Protobuf binary
 * concatenation is a merge (repeated fields append), so the two files are simply joined.
 */
export function loadVendorUIDatabase(): UIDatabase {
  const main = readFileSync(`${VENDOR_DIR}db.bin`);
  const leftover = existsSync(`${VENDOR_DIR}leftover_db.bin`)
    ? readFileSync(`${VENDOR_DIR}leftover_db.bin`)
    : Buffer.alloc(0);
  return UIDatabase.fromBinary(new Uint8Array(Buffer.concat([main, leftover])));
}
