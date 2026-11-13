import type {
  ProgressMetrics,
  RaidSimRequest,
  RaidSimResult,
  StatWeightsRequest,
  StatWeightsResult,
} from '@fsim/proto';
import { z } from 'zod';

/**
 * engine.lock.json at the repo root. Written by the engine-sync pipeline (lane L1), read by the
 * engine runtime (lane L2) to fetch and verify the WASM and data for a given engine version.
 *
 * Upstream's git tags are stale (inherited from the TBC fork), so an engine version is identified by
 * the upstream commit that wowsims.com/forever serves (wowsims/pages-deploy forever/version.json).
 */
export const EngineArtifactSchema = z.object({
  url: z.string().url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
});

export const EngineLockSchema = z.object({
  schema: z.literal(1),
  upstream: z.object({
    repo: z.literal('wowsims/forever'),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    committedAt: z.iso.datetime({ offset: true }),
  }),
  /** Short id shown in the UI and stored with every run, e.g. "b2047bf". */
  engineId: z.string().min(7),
  /** Game client build the data was extracted from, when known. */
  dataBuild: z.string().nullable(),
  goVersion: z.string(),
  /** Null until the pipeline (lane L1) has built and uploaded this engine version. */
  artifacts: z
    .object({
      wasm: EngineArtifactSchema, // lib.wasm.gz
      wasmExec: EngineArtifactSchema, // wasm_exec.js matching goVersion
      db: EngineArtifactSchema, // db.bin
      leftoverDb: EngineArtifactSchema, // leftover_db.bin
    })
    .nullable(),
  syncedAt: z.iso.datetime({ offset: true }),
});
export type EngineLock = z.infer<typeof EngineLockSchema>;

/** Which engine a run used. Stored on every run so old results stay explainable. */
export interface EngineVersion {
  engineId: string;
  commit: string;
  dataBuild: string | null;
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (p: ProgressMetrics) => void;
}

/**
 * The engine runtime's public surface (lane L2). Callers pass complete engine requests; building
 * requests from a `Character` (including each player's `SimDatabase` subset) is the engine
 * package's `toRaidSimRequest` helper, not this interface.
 *
 * Facts from the Phase 0 spike (packages/engine/README.md):
 * - the WASM carries no item data: every Player needs `database` with its items, enchants,
 *   random suffixes, item-effect rand-prop points, consumables and spell effects;
 * - results are deterministic for a given seed and match the native Go build exactly.
 */
export interface EngineClient {
  readonly version: EngineVersion;
  /** Number of workers the pool runs. */
  readonly concurrency: number;
  raidSim(req: RaidSimRequest, opts?: RunOptions): Promise<RaidSimResult>;
  statWeights(req: StatWeightsRequest, opts?: RunOptions): Promise<StatWeightsResult>;
  dispose(): void;
}
