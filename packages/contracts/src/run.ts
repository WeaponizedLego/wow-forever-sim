import type { Character } from './character';
import type { EngineVersion } from './engine';

/** A finished sim, as stored in local history and referenced by share links. */
export interface RunRecord {
  /** Short sequential id shown in the UI, e.g. "#0412". */
  id: string;
  createdAt: string;
  kind: 'single' | 'stat-weights' | 'top-gear';
  character: Character;
  engine: EngineVersion;
  iterations: number;
  seed: number;
  /**
   * Run this one is compared against, if any. Only meaningful when that run has the same `lineageId`:
   * records made before lineages existed may name the previous run of a different character.
   */
  baselineId?: string;
  /**
   * The character lineage this run belongs to: a new import, spec preset or share link starts one; edits
   * and saved variants of it keep it. Absent on older records, which count as a lineage of their own.
   */
  lineageId?: string;
  /** Headline numbers, so lists render without loading the full result. */
  summary: RunSummary;
}

export interface RunSummary {
  dpsMean: number;
  dpsStdev: number;
  /** Half-width of the 95% confidence interval of the mean. */
  dpsCi95: number;
  wallMs: number;
}
