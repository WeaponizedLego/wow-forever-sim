// Start screen state and helpers: the paste box (kept for the page load, so going to the workbench and
// back keeps it), line markers and the parse summary, the spec picker list, and the reference DPS rows.
import {
  CLASS_IDS,
  CLASSES,
  ITEM_SLOTS,
  RACES,
  SPECS,
  type ClassId,
  type Diagnostic,
  type ImportResult,
  type SpecId,
} from '@fsim/contracts';
import { PRESET_INDEX, type PresetSummary } from '@fsim/gamedata';
import { Spec } from '@fsim/proto/common';
import baselineJson from '../../../../tools/engine-build/smoke-baseline.json';
import lockJson from '../../../../engine.lock.json';
import type { CheckItem, LineMarker } from './ui-types';

// ---------------------------------------------------------------- paste box

const text = ref('');
const result = shallowRef<ImportResult | null>(null);
const parsing = ref(false);
const parseError = ref<string | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** The paste box and its parse result. Call `schedule()` when the text changes. */
export function useStartImport() {
  const session = useSession();

  function schedule(delay = 200) {
    clearTimeout(timer);
    const input = text.value;
    if (input.trim() === '') {
      seq++;
      result.value = null;
      parseError.value = null;
      parsing.value = false;
      return;
    }
    parsing.value = true;
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const r = await session.parseImport(input);
        if (mine !== seq) return;
        result.value = r;
        parseError.value = null;
      } catch (e) {
        if (mine !== seq) return;
        result.value = null;
        parseError.value = e instanceof Error ? e.message : String(e);
      } finally {
        if (mine === seq) parsing.value = false;
      }
    }, delay);
  }

  return {
    text,
    result: computed(() => result.value),
    parsing: computed(() => parsing.value),
    parseError: computed(() => parseError.value),
    schedule,
  };
}

const severityStatus = (s: Diagnostic['severity']): LineMarker['status'] =>
  s === 'info' ? 'info' : 'warning';

/**
 * Per-line markers: diagnostics on their line (warning beats info), and for SimC exports a ✓ on every
 * option line the importer read without a note.
 */
export function startLineMarkers(input: string, r: ImportResult | null): Record<number, LineMarker> {
  const out: Record<number, LineMarker> = {};
  if (!r) return out;
  for (const d of r.diagnostics) {
    if (!d.line) continue;
    const prev = out[d.line];
    const status = severityStatus(d.severity);
    out[d.line] = {
      status: prev?.status === 'warning' ? 'warning' : status,
      message: prev?.message ? `${prev.message} ${d.message}` : d.message,
    };
  }
  if (r.format === 'simc' && r.character) {
    input.split(/\r\n|\r|\n/).forEach((raw, i) => {
      const t = raw.trim();
      if (!out[i + 1] && t !== '' && !t.startsWith('#') && /^[A-Za-z0-9_.]+\s*=/.test(t))
        out[i + 1] = { status: 'good' };
    });
  }
  return out;
}

export function startDiagnosticItems(diagnostics: readonly Diagnostic[]): CheckItem[] {
  return diagnostics.map((d) => ({
    status: severityStatus(d.severity),
    code: d.code,
    text: d.message,
    where: d.line ? `line ${d.line}` : '—',
  }));
}

const FORMAT_LABEL: Record<NonNullable<ImportResult['format']>, string> = {
  simc: 'SimC addon export',
  'wowsims-json': 'WoWSims JSON',
  'wowhead-url': 'Wowhead planner link',
};

/** "SimC addon export · 12.1.5-04" from the format and, for SimC, the addon header line. */
export function startFormatLabel(input: string, r: ImportResult | null): string {
  if (!r?.format) return 'format not recognised';
  const addon = r.format === 'simc' ? /^#\s*SimC Addon\s+(\S+)/im.exec(input)?.[1] : undefined;
  return addon ? `${FORMAT_LABEL[r.format]} · ${addon}` : FORMAT_LABEL[r.format];
}

/** Talent points per tree from an engine talent string ("5320001-0052-4" → "16/12/4"); null if not one. */
export function startTalentPoints(talents: string): string | null {
  if (!/^[0-9]+(-[0-9]*){0,2}$/.test(talents)) return null;
  const trees = talents.split('-');
  while (trees.length < 3) trees.push('');
  return trees.map((t) => [...t].reduce((s, d) => s + Number(d), 0)).join('/');
}

export const START_SLOT_COUNT = ITEM_SLOTS.length;
export const startRaceName = (id: keyof typeof RACES) => RACES[id].name;
export const startSpecName = (id: SpecId) => SPECS.find((s) => s.id === id)?.name ?? id;

// ---------------------------------------------------------------- spec picker

export interface StartSpecEntry {
  id: SpecId;
  /** Name inside its class block: "Balance", "Feral (Cat)", "DPS". */
  label: string;
  status: PresetSummary['status'];
  /** Why the spec cannot start, or null. */
  blocked: string | null;
  /** What upstream lacks, for specs that start anyway. */
  caveat: string | null;
  builds: PresetSummary['builds'];
}

export interface StartClassEntry {
  id: ClassId;
  name: string;
  specs: StartSpecEntry[];
}

function specLabel(name: string, className: string, role: string): string {
  const rest = name.replace(className, '').replace(/\s+/g, ' ').trim();
  return rest || role.toUpperCase();
}

/** Classes in the engine's order, each with its engine specs and what their presets allow. */
export const START_CLASSES: StartClassEntry[] = CLASS_IDS.map((cls) => ({
  id: cls,
  name: CLASSES[cls].name,
  specs: SPECS.filter((s) => s.class === cls).map((s) => {
    const p = PRESET_INDEX.specs.find((x) => x.specId === s.id);
    const missing = p?.missing ?? [];
    const blocked =
      !p || p.status === 'none'
        ? 'No upstream presets yet'
        : missing.includes('apl-rotation')
          ? 'No upstream rotation to sim'
          : null;
    const caveat =
      !blocked && missing.includes('gear') ? 'Starts without gear: upstream has no default set' : null;
    return {
      id: s.id,
      label: specLabel(s.name, CLASSES[cls].name, s.role),
      status: p?.status ?? 'none',
      blocked,
      caveat,
      builds: p?.builds ?? [],
    };
  }),
}));

// ---------------------------------------------------------------- engine & reference DPS

interface BaselineFile {
  engineId: string;
  commit: string;
  generatedAt: string;
  tolerance: number;
  specs: Record<string, { spec: string; dps: number; stdev: number; iterations: number; engineId: string }>;
  skipped?: Record<string, string>;
}

export interface ReferenceRow {
  key: string;
  label: string;
  cls: ClassId;
  dps: number;
  stdev: number;
}

export const START_BASELINE = baselineJson as BaselineFile;
export const START_LOCK = lockJson as {
  upstream: { repo: string; commit: string; committedAt: string };
  engineId: string;
  dataBuild: string | null;
  syncedAt: string;
};
export const START_PRESET_COMMIT = PRESET_INDEX.commit;

const splitCamel = (s: string) => s.replace(/^Test/, '').replace(/([a-z])([A-Z])/g, '$1 $2');

function classOfProtoSpec(name: string): ClassId | null {
  const proto = (Spec as unknown as Record<string, number>)[name];
  return SPECS.find((s) => s.proto === proto)?.class ?? null;
}

/** One row per upstream test profile, highest DPS first. */
export function startReferenceRows(b: BaselineFile = START_BASELINE): ReferenceRow[] {
  return Object.entries(b.specs)
    .flatMap(([key, v]) => {
      const cls = classOfProtoSpec(v.spec);
      return cls ? [{ key, label: splitCamel(key), cls, dps: v.dps, stdev: v.stdev }] : [];
    })
    .sort((a, b) => b.dps - a.dps);
}

export const startSkippedLabels = (b: BaselineFile = START_BASELINE) =>
  Object.keys(b.skipped ?? {}).map(splitCamel);

/** Percent change per profile between two baselines (only profiles in both). */
export function startTuningDeltas(prev: BaselineFile, cur: BaselineFile = START_BASELINE) {
  return startReferenceRows(cur).flatMap((r) => {
    const p = prev.specs[r.key];
    return p && p.dps > 0 ? [{ label: r.label, marker: r.cls, value: ((r.dps - p.dps) / p.dps) * 100 }] : [];
  });
}
export type StartBaseline = BaselineFile;

// ---------------------------------------------------------------- time

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const startDate = (iso: string) => dateFmt.format(new Date(iso));

/** "just now", "4 min", "2 h", "yesterday", "3 days". */
export function startAgo(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days`;
}
