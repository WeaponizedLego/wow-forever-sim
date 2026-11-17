// The sim settings a person picks once and expects back: the iterations preset (1k / 5k / 25k) and whether a
// Workbench sim also runs stat weights. Kept in localStorage, best-effort: private windows and blocked storage
// fall back to the defaults (5k, stat weights on).

export const ITERATION_PRESETS = { '1k': 1000, '5k': 5000, '25k': 25000 } as const;
export type IterationPreset = keyof typeof ITERATION_PRESETS;
export const DEFAULT_ITERATION_PRESET: IterationPreset = '5k';

export const ITERATIONS_KEY = 'fsim:iterations';
export const STAT_WEIGHTS_KEY = 'fsim:stat-weights';

/** A stored preset, or the default for nothing or junk. */
export function decodeIterationPreset(raw: string | null | undefined): IterationPreset {
  return raw && Object.hasOwn(ITERATION_PRESETS, raw) ? (raw as IterationPreset) : DEFAULT_ITERATION_PRESET;
}

/** A stored stat-weights choice: on unless it was turned off. */
export const decodeStatWeights = (raw: string | null | undefined): boolean => raw !== '0';
export const encodeStatWeights = (on: boolean): string => (on ? '1' : '0');

export function readPref(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Full or blocked storage: the choice holds for this visit only.
  }
}
