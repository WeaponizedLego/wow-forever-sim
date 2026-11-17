// Shared, remembered sim settings (utils/sim-prefs.ts). The Workbench sim bar, the command palette's "Run sim" and
// the start screen's "Sim as-is" read and set the same iterations preset. The stat-weights choice is the sim bar's,
// shared so the palette can say when "Run sim" also runs stat weights.
import {
  ITERATION_PRESETS,
  ITERATIONS_KEY,
  STAT_WEIGHTS_KEY,
  decodeIterationPreset,
  decodeStatWeights,
  encodeStatWeights,
  readPref,
  writePref,
  type IterationPreset,
} from '~/utils/sim-prefs';

// The app is client-rendered only (ssr: false), so storage can be read when this module loads.
const presetState = ref<IterationPreset>(decodeIterationPreset(readPref(ITERATIONS_KEY)));
const weightsState = ref(decodeStatWeights(readPref(STAT_WEIGHTS_KEY)));

const preset = computed<IterationPreset>({
  get: () => presetState.value,
  set: (v) => {
    presetState.value = v;
    writePref(ITERATIONS_KEY, v);
  },
});
const withWeights = computed<boolean>({
  get: () => weightsState.value,
  set: (v) => {
    weightsState.value = v;
    writePref(STAT_WEIGHTS_KEY, encodeStatWeights(v));
  },
});
const iterations = computed(() => ITERATION_PRESETS[presetState.value]);

/** The remembered iterations preset (and its count) and the stat-weights choice. */
export function useSimPrefs() {
  return { preset, withWeights, iterations };
}

/** The options of a 1k / 5k / 25k segmented control. */
export const ITERATION_OPTIONS = (Object.keys(ITERATION_PRESETS) as IterationPreset[]).map((value) => ({
  value,
  label: value,
  mono: true,
}));
