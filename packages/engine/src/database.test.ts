import { RaidSimRequest } from '@fsim/proto/api';
import { SimDatabase, SimEnchant, SimItem } from '@fsim/proto/db';
import { UIEnchant, UIItem } from '@fsim/proto/ui';
import { afterAll, describe, expect, it } from 'vitest';
import type { WasmEngineClient } from './client';
import { buildPlayerDatabase, consumableIds, withDatabases } from './database';
import { createVendorEngineClient } from './node';
import { VENDOR_MISSING, hasVendorDb, loadRaidSimRequest, loadVendorUIDatabase } from './testing/fixtures';

const fixtureReq = loadRaidSimRequest();
const player = fixtureReq.raid!.parties[0]!.players[0]!;

describe('consumableIds', () => {
  it('collects scalar ids and id lists from ConsumesSpec, skipping zeros', () => {
    const ids = consumableIds(player);
    expect(ids).toContain(player.consumables!.flaskId);
    expect(ids).toContain(player.consumables!.elixirIds[0]);
    expect(ids).toContain(player.consumables!.extraIds[4]);
    expect(ids).not.toContain(0);
  });
});

describe.skipIf(!hasVendorDb())('buildPlayerDatabase from upstream db.bin', () => {
  const db = hasVendorDb() ? loadVendorUIDatabase() : undefined;

  it('holds only what the player uses', () => {
    const sub = buildPlayerDatabase(player, db!);
    const equipped = player.equipment!.items.filter((i) => i.id);
    expect(sub.items.map((i) => i.id).sort()).toEqual(equipped.map((i) => i.id).sort());
    expect(sub.randomSuffixes.map((s) => s.id)).toEqual([12728]);
    expect(new Set(sub.enchants.map((e) => e.effectId))).toEqual(
      new Set(equipped.filter((i) => i.enchant).map((i) => i.enchant)),
    );
    expect(sub.consumables.map((c) => c.id).sort()).toEqual(consumableIds(player).sort());
    expect(sub.itemEffectRandPropPoints.length).toBeLessThanOrEqual(sub.items.length);

    const spikeBytes = SimDatabase.toBinary(player.database!).length;
    const subBytes = SimDatabase.toBinary(sub).length;
    console.log(
      `[db subset] ${subBytes} B binary vs spike's ${spikeBytes} B (all consumables/effects/rand-prop points)`,
    );
    expect(subBytes).toBeLessThan(spikeBytes / 5);
  });

  it('adds the Darkspear item while the party buff is on', () => {
    expect(
      buildPlayerDatabase(player, db!, { darkspear: true } as never).items.some((i) => i.id === 12802),
    ).toBe(true);
  });

  describe.skipIf(!!VENDOR_MISSING)('sims like the whole database', () => {
    // A fresh client: the engine's item database is global per worker and only grows, so a worker that
    // already ran with more rows would hide anything missing from the subset.
    let client: WasmEngineClient | undefined;
    afterAll(() => client?.dispose());

    it('the subset gives exactly the DPS the whole database gives', async () => {
      const stripped: RaidSimRequest = withDatabases(fixtureReq, {
        ...db!,
        items: [],
        enchants: [],
        consumables: [],
      });
      expect(stripped.raid!.parties[0]!.players[0]!.database!.items).toHaveLength(0);
      const some = { ...fixtureReq, simOptions: { ...fixtureReq.simOptions!, iterations: 1000 } };
      const subset = withDatabases(some, db!);
      expect(fixtureReq.raid!.parties[0]!.players[0]!.database!.consumables.length).toBeGreaterThan(100); // input untouched

      // The reference: the same player with every row of the same db.bin (not the fixture's own database,
      // which is upstream's data as of the capture). It runs second, on the worker the subset ran on.
      const whole = RaidSimRequest.clone(some);
      const json = { ignoreUnknownFields: true };
      whole.raid!.parties[0]!.players[0]!.database = SimDatabase.create({
        items: db!.items.map((i) => SimItem.fromJson(UIItem.toJson(i), json)),
        enchants: db!.enchants.map((e) => SimEnchant.fromJson(UIEnchant.toJson(e), json)),
        randomSuffixes: db!.randomSuffixes,
        itemEffectRandPropPoints: db!.itemEffectRandPropPoints,
        consumables: db!.consumables,
        spellEffects: db!.spellEffects,
      });

      client = createVendorEngineClient({ concurrency: 1, engineLogs: false });
      const fromSubset = await client.raidSim(subset);
      const fromWhole = await client.raidSim(whole);
      expect(fromSubset.raidMetrics!.dps!.avg).toBeGreaterThan(0);
      expect(fromSubset.raidMetrics!.dps!.avg).toBe(fromWhole.raidMetrics!.dps!.avg);
      expect(fromSubset.raidMetrics!.dps!.allValues).toEqual(fromWhole.raidMetrics!.dps!.allValues);
    });
  });
});
