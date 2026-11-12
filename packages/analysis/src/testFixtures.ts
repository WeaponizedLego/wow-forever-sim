// Test-only helper: loads the Phase 0 engine fixtures. Not exported from the package.
import { readFileSync } from 'node:fs';
import { RaidSimResult, StatWeightsResult } from '@fsim/proto';

const dir = new URL('../../../fixtures/engine/', import.meta.url);
const json = (name: string): unknown => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));

let raid: RaidSimResult | undefined;
let weights: StatWeightsResult | undefined;

/** Survival Hunter, 5,000 iterations, seed 0x5F1A, allValues and iteration-1 logs. */
export function raidFixture(): RaidSimResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (raid ??= RaidSimResult.fromJson(json('sv-raidsim-result.json') as any));
}

/** Stat weights for the same character (Str, Agi, AP, RAP; 2,000 iterations). */
export function weightsFixture(): StatWeightsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (weights ??= StatWeightsResult.fromJson(json('sv-statweights-result.json') as any));
}
