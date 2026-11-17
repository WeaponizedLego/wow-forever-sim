import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ITERATION_PRESET,
  ITERATION_PRESETS,
  decodeIterationPreset,
  decodeStatWeights,
  encodeStatWeights,
  readPref,
  writePref,
} from './sim-prefs';

describe('sim prefs', () => {
  it('reads back every iterations preset and falls back to 5k for nothing or junk', () => {
    for (const k of Object.keys(ITERATION_PRESETS)) expect(decodeIterationPreset(k)).toBe(k);
    expect(DEFAULT_ITERATION_PRESET).toBe('5k');
    expect(decodeIterationPreset(null)).toBe('5k');
    expect(decodeIterationPreset('')).toBe('5k');
    expect(decodeIterationPreset('100k')).toBe('5k');
    expect(decodeIterationPreset('toString')).toBe('5k');
  });

  it('keeps stat weights on unless they were turned off', () => {
    expect(decodeStatWeights(null)).toBe(true);
    expect(decodeStatWeights(encodeStatWeights(true))).toBe(true);
    expect(decodeStatWeights(encodeStatWeights(false))).toBe(false);
  });

  it('reads nothing and writes nowhere without storage, without throwing', () => {
    expect(readPref('fsim:iterations')).toBeNull();
    expect(() => writePref('fsim:iterations', '1k')).not.toThrow();
  });
});
