import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RaidSimRequest, RaidSimResult, StatWeightsResult } from './index';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/engine/${name}`, import.meta.url), 'utf8'));

// Proves the generated types match what the pinned engine actually produces.
describe('engine fixtures parse with the generated types', () => {
  it('raid sim request carries a per-player SimDatabase', () => {
    const req = RaidSimRequest.fromJson(fixture('sv-raidsim-request.json'));
    const player = req.raid!.parties[0]!.players[0]!;
    expect(player.database!.items.length).toBeGreaterThan(10);
    expect(player.database!.consumables.length).toBeGreaterThan(0);
    expect(req.simOptions!.iterations).toBe(5000);
  });

  it('raid sim result has every-iteration values and the iteration-1 log', () => {
    const res = RaidSimResult.fromJson(fixture('sv-raidsim-result.json'));
    const dps = res.raidMetrics!.dps!;
    expect(dps.avg).toBeCloseTo(850.1968, 3);
    expect(dps.allValues).toHaveLength(5000);
    expect(res.logs.length).toBeGreaterThan(1000);
    expect(res.raidMetrics!.parties[0]!.players[0]!.actions.length).toBeGreaterThan(0);
  });

  it('stat weights result has weights and their stdev', () => {
    const res = StatWeightsResult.fromJson(fixture('sv-statweights-result.json'));
    expect(res.error).toBeUndefined();
    expect(res.dps!.weightsStdev!.stats.length).toBeGreaterThan(0);
  });
});
