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
  /** Run this one is compared against, if any. */
  baselineId?: string;
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
