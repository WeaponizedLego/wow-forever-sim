// Sample data for /dev/kit, ported from the v2 mockups' renderVals() (same seed and the same order
// of random draws, so the shapes match the mockups when compared side by side).
// The leading "-" keeps Nuxt from turning this file into a route.
import type { ClassId } from '@fsim/contracts';
import type { CheckItem, LineMarker, Quality } from '~/composables/ui-types';

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pdf = (x: number, m: number, s: number) =>
  Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

// ---------------------------------------------------------------- Analysis
const rnd = mulberry(0x5f1a);

const LO = 880;
const HI = 1500;
const BINS = 40;
const BW = (HI - LO) / BINS;
const cur: number[] = [];
const base: number[] = [];
for (let i = 0; i < BINS; i++) {
  const x = LO + (i + 0.5) * BW;
  cur.push(Math.round(5000 * BW * pdf(x, 1184.2, 112.4) * (0.94 + rnd() * 0.12)));
  base.push(Math.round(5000 * BW * pdf(x, 1161.8, 114.0) * (0.94 + rnd() * 0.12)));
}
export const histogram = {
  bins: cur.map((count, i) => ({ lo: LO + i * BW, hi: LO + (i + 1) * BW, count })),
  baseline: base,
  total: 5000,
  mean: 1184.2,
  baselineMean: 1161.8,
  p5: 999.3,
  p95: 1369.1,
  xTicks: [900, 1000, 1100, 1200, 1300, 1400, 1500],
};

const L0 = Math.log(50);
const L1 = Math.log(5000);
export const convergence: { x: number; y: number; lo: number; hi: number }[] = [];
for (let k = 0; k <= 60; k++) {
  const n = Math.round(Math.exp(L0 + ((L1 - L0) * k) / 60));
  const ci = (1.96 * 112.4) / Math.sqrt(n);
  const m = 1184.2 + (rnd() - 0.5) * 2.2 * ci * 0.5 + (k < 10 ? (-12 * (10 - k)) / 10 : 0);
  convergence.push({ x: n, y: m, lo: m - ci, hi: m + ci });
}

export const timeline: { x: number; y: number; lo: number; hi: number }[] = [];
for (let b = 0; b <= 36; b++) {
  const t = b * 5;
  let v = 1100 + 380 * Math.exp(-t / 14) + (t >= 144 ? 210 : 0) + (rnd() - 0.5) * 34;
  if (t > 140 && t < 144) v += 90;
  timeline.push({ x: t, y: v, lo: v - 150, hi: v + 150 });
}

const scatter = (cov: number, len: number) => {
  const s: [number, number][] = [];
  let t = 0;
  while (t < 180) {
    const on = len * (0.5 + rnd());
    const off = (((on * (1 - cov)) / cov) * (0.6 + rnd() * 0.8)) as number;
    s.push([t, Math.min(180, t + on)]);
    t += on + off;
  }
  return s;
};
export const lanes = [
  { name: 'Death Wish', uptime: 0.167, segments: [[0, 30]] as [number, number][] },
  { name: 'Recklessness', uptime: 0.083, segments: [[0, 15]] as [number, number][] },
  { name: 'Mighty Rage Potion', uptime: 0.111, segments: [[0, 20]] as [number, number][] },
  { name: 'Flurry', uptime: 0.61, segments: scatter(0.61, 6) },
  { name: 'Enrage', uptime: 0.48, segments: scatter(0.48, 8) },
  { name: 'Crusader (MH)', uptime: 0.31, segments: scatter(0.31, 9) },
  { name: 'Execute phase', uptime: 0.2, segments: [[144, 180]] as [number, number][] },
];

export const rage: { x: number; y: number }[] = [];
{
  let r = 20;
  for (let i = 0; i <= 180; i++) {
    r += (rnd() - 0.47) * 22;
    if (rnd() < 0.08) r -= 25;
    r = Math.max(4, Math.min(100, r));
    rage.push({ x: i, y: r });
  }
}

const hd = (h: number) => 1184.2 + 34.9 * (Math.min(h, 9) - 8) + 3 * Math.max(h - 9, 0);
export const hitScaling = [4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({ x: h, y: hd(h) }));
export const hitYou = { x: 8, y: hd(8), label: 'you · 8.0%' };

export const abilities = [
  ['Bloodthirst', 312.4, 1.2, 26.4, 19.4, 968, [67.2, 31.2, 0, 1.6]],
  ['Melee · main hand', 298.1, 1.4, 25.2, 47.5, 412, [5.6, 29.8, 40, 24.6]],
  ['Melee · off hand', 141.0, 0.9, 11.9, 46.3, 201, [5.8, 29.6, 40, 24.6]],
  ['Whirlwind', 132.8, 0.8, 11.2, 9.5, 842, [62.9, 30.5, 0, 6.6]],
  ['Heroic Strike', 121.5, 1.1, 10.3, 20.6, 355, [62.4, 31.0, 0, 6.6]],
  ['Deep Wounds', 64.0, 0.4, 5.4, null, 74, [100, 0, 0, 0]],
  ['Execute', 58.9, 0.7, 5.0, 3.3, 1083, [60.3, 33.1, 0, 6.6]],
  ['Hamstring', 44.1, 0.3, 3.7, 15.7, 168, [63.2, 30.2, 0, 6.6]],
].map(([name, dps, err, share, cpm, avg, o]) => {
  const out = o as number[];
  return {
    name: name as string,
    dps: dps as number,
    err: err as number,
    share: share as number,
    cpm: cpm as number | null,
    avg: avg as number,
    outcomes: { hit: out[0]!, crit: out[1]!, glance: out[2]!, miss: out[3]! },
  };
});

export const weights = [
  { stat: 'Hit', unit: 'per 1%', value: 34.9, ci: 1.8, rel: 5.2 },
  { stat: 'Crit', unit: 'per 1%', value: 31.6, ci: 1.6, rel: 5.1 },
  { stat: 'Sword skill', unit: 'per pt', value: 7.2, ci: 0.9, rel: 12.5 },
  { stat: 'Strength', unit: 'per pt', value: 2.21, ci: 0.12, rel: 5.4 },
  { stat: 'Agility', unit: 'per pt', value: 1.38, ci: 0.11, rel: 8.0 },
  { stat: 'Attack power', unit: 'per pt', value: 1.0, ci: 0, rel: 0 },
];

export const notes: CheckItem[] = [
  {
    status: 'info',
    code: 'HIT-01',
    text: 'Hit is 8.0%, 1.0% under the 9% cap. The next 1% is the largest single gain available (≈ +34.9 DPS).',
    action: { label: 'Find hit items', to: '#' },
  },
  {
    status: 'warning',
    code: 'RES-02',
    text: 'Rage was at cap for 4.1% of the fight (7.4s per iteration). Rage spent nothing during those windows.',
    action: { label: 'Variant: HS threshold 40', to: '#' },
  },
  {
    status: 'warning',
    code: 'DATA-03',
    text: 'Shoulder item 99412 is not in data build 70862 and was left out of the sim. Results understate DPS.',
    action: { label: 'Pick a substitute', to: '#' },
  },
  {
    status: 'info',
    code: 'CD-04',
    text: 'Death Wish and Mighty Rage Potion overlap in 100% of iterations; Recklessness is used once per fight.',
    action: { label: 'Edit rotation', to: '#' },
  },
];

// ---------------------------------------------------------------- Workbench
export interface GearRow {
  slot: string;
  name: string;
  quality: Quality;
  ilvl: number | null;
  source: string;
  enchant: string;
  value: number | null;
  gain?: number;
  was?: string;
  enchantNew?: boolean;
  missing?: boolean;
}
const g = (
  slot: string,
  name: string,
  quality: Quality,
  ilvl: number | null,
  source: string,
  enchant: string,
  value: number | null,
  o: Partial<GearRow> = {},
): GearRow => ({ slot, name, quality, ilvl, source, enchant, value, ...o });
export const gear: GearRow[] = [
  g('Head', 'Lionheart Helm', 'epic', 65, 'Crafted · Blacksmithing', 'Lesser Arcanum of Voracity', 48.2),
  g('Neck', 'Onyxia Tooth Pendant', 'epic', 74, 'Onyxia', '', 21.5),
  g('Shoulder', 'Item 99412 — not in data', 'common', null, 'Unknown', '', null, { missing: true }),
  g('Back', 'Cape of the Black Baron', 'rare', 63, 'Stratholme · Baron', '+3 Agility', 12.4),
  g('Chest', 'Savage Gladiator Chain', 'epic', 57, 'BRD · Gorosh', 'Greater Stats', 41.9, {
    enchantNew: true,
    gain: 2.1,
  }),
  g('Wrist', 'Bracers of Might', 'epic', 66, 'Molten Core · trash', '+9 Strength', 22.7, {
    was: 'Wristguards of Stability',
    gain: 6.8,
  }),
  g('Hands', 'Flameguard Gauntlets', 'epic', 66, 'Molten Core · Sulfuron', '+7 Strength', 24.3),
  g('Waist', 'Onslaught Girdle', 'epic', 78, 'Molten Core · Ragnaros', '', 30.6),
  g('Legs', 'Eldritch Reinforced Legplates', 'rare', 62, 'World drop', 'Lesser Arcanum of Voracity', 31.0),
  g('Feet', 'Chromatic Boots', 'epic', 77, 'BWL · Chromaggus', '+7 Agility', 22.1),
  g('Ring', 'Quick Strike Ring', 'epic', 67, 'Molten Core · trash', '', 18.7),
  g('Ring', "Don Julio's Band", 'epic', 60, 'Quest · Molten Core', '', 14.2),
  g('Trinket', 'Hand of Justice', 'rare', 58, 'BRD · Emperor', '', 26.4),
  g('Trinket', "Blackhand's Breadth", 'rare', 63, 'UBRS · Drakkisath', '', 16.0),
  g('Main hand', 'Brutality Blade', 'epic', 70, 'Molten Core · Garr', 'Crusader', 142.0),
  g('Off hand', "Vis'kag the Bloodletter", 'epic', 63, 'Onyxia', 'Crusader', 71.3),
  g('Ranged', "Striker's Mark", 'epic', 69, 'Molten Core · Magmadar', '', 9.1),
];

export const stats = [
  ['Strength', '412', '426', 14, 0],
  ['Agility', '196', '199', 3, 0],
  ['Attack power', '1,486', '1,514', 28, 0],
  ['Melee crit', '24.31%', '24.46%', 0.15, 2],
  ['Melee hit', '8.0%', '9.0%', 1.0, 1],
  ['Sword skill', '305', '305', 0, 0],
  ['Armor', '4,870', '4,812', -58, 0],
  ['Health', '5,912', '5,932', 20, 0],
].map(([stat, run, draft, delta, digits]) => ({
  stat: stat as string,
  run: run as string,
  draft: draft as string,
  delta: delta as number,
  digits: digits as number,
}));

export const caps = [
  {
    label: 'Melee hit',
    value: 9,
    cap: 9,
    max: 12,
    valueText: '9.0 / 9.0%',
    note: 'At cap with the draft. Hit beyond this is worth ≈ 3 DPS per 1%.',
  },
  {
    label: 'Sword skill',
    value: 305,
    cap: 315,
    max: 463,
    valueText: '305 / 315',
    note: '10 below the point where glancing penalty stops shrinking.',
  },
  {
    label: 'Crit ceiling (attack table)',
    value: 29.8,
    cap: 35.4,
    max: 47.8,
    valueText: '29.8 / 35.4%',
    note: 'White-hit crit is capped by glance + miss + dodge. 5.6% headroom.',
  },
];

// ---------------------------------------------------------------- Top gear
export const COMPARE = { lo: 1165, hi: 1205, base: 1184.2, ci: 3.1, noise: 4.4 };
type Change = { tag: string; name: string; quality: Quality };
const ch = (tag: string, name: string, quality: Quality): Change => ({ tag, name, quality });
const BM = ch('WRIST', 'Bracers of Might', 'epic');
const TF = ch('WRIST', 'Wristguards of True Flight', 'epic');
const BWr = ch('WRIST', 'Bracers of Wrath', 'epic');
const BA = ch('WRIST', 'Battleborn Armbraces', 'rare');
const VS = ch('WRIST', 'Vambraces of the Sadist', 'epic');
const BH = ch('WRIST', 'Bracers of Heroism', 'rare');
const CA = ch('RING', 'Circle of Applied Force', 'epic');
const MF = ch('RING', 'Mark of Fordring', 'rare');
const BL = ch('RANGED', 'Blastershot Launcher', 'epic');
export const ranking = (
  [
    [[BM, CA], 1196.8],
    [[BM, BL], 1192.3],
    [[BM], 1191.0],
    [[TF, CA], 1190.2],
    [[TF], 1188.8],
    [[BA, CA], 1187.9],
    [[CA], 1186.0],
    [[BL], 1185.1],
    [[], COMPARE.base],
    [[VS], 1183.8],
    [[BWr], 1183.0],
    [[BWr, MF], 1179.6],
    [[BH], 1178.6],
    [[MF], 1177.9],
  ] as [Change[], number][]
).map(([changes, mean], i) => ({
  rank: i + 1,
  changes,
  equipped: changes.length === 0,
  mean,
  delta: mean - COMPARE.base,
  lo: mean - COMPARE.ci,
  hi: mean + COMPARE.ci,
}));

export const inWins: { name: string; quality: Quality; n: number }[] = [
  { name: 'Bracers of Might', quality: 'epic', n: 3 },
  { name: 'Circle of Applied Force', quality: 'epic', n: 2 },
  { name: 'Wristguards of True Flight', quality: 'epic', n: 2 },
  { name: 'Blastershot Launcher', quality: 'epic', n: 1 },
  { name: 'Battleborn Armbraces', quality: 'rare', n: 0 },
];

export const bestPerSlot = [
  { slot: 'Wrist', item: 'Bracers of Might', gain: 6.8 },
  { slot: 'Ring', item: 'Circle of Applied Force', gain: 1.8 },
  { slot: 'Ranged', item: 'Blastershot Launcher', gain: 0.9 },
];

// ---------------------------------------------------------------- Start
export const pasted = [
  '# Kargath - Fury - 2026-11-11 21:04',
  'warrior="Kargath"',
  'level=60',
  'race=orc',
  'region=eu',
  'server=ashbringer',
  'spec=fury',
  'talents=30305001302-05050005525010051',
  'head=,id=12640,enchant_id=2583',
  'neck=,id=18404',
  'shoulder=,id=99412',
  'back=,id=13340,enchant_id=849',
  'chest=,id=11726,enchant_id=1891',
  'wrist=,id=12550,enchant_id=1885',
  'hands=,id=19143,enchant_id=927',
  'waist=,id=19137',
].join('\n');

export const pastedMarkers: Record<number, LineMarker> = Object.fromEntries(
  Array.from({ length: 15 }, (_, i) => i + 2).map((n) => [
    n,
    n === 11
      ? { status: 'warning', message: 'Shoulder 99412 is not in data build 70862. It will be left empty.' }
      : { status: 'good' },
  ]),
) as Record<number, LineMarker>;

export const parseChecks: CheckItem[] = [
  { status: 'good', text: 'Format recognised: SimulationCraft, Forever addon export', where: 'line 1' },
  { status: 'good', text: '16 items mapped, 9 enchants mapped', where: '9–26' },
  {
    status: 'warning',
    text: 'Shoulder 99412 is not in data build 70862. It will be left empty.',
    where: 'line 11',
  },
  { status: 'info', text: 'No consumables in export. Raid preset will be applied.', where: '—' },
  { status: 'info', text: 'Rotation not in export. Using upstream default APL for Fury.', where: '—' },
];

export const classSpecs: { cls: ClassId; name: string; specs: string[] }[] = [
  { cls: 'druid', name: 'Druid', specs: ['Balance', 'Feral', 'Guardian'] },
  { cls: 'hunter', name: 'Hunter', specs: ['Beast Mastery', 'Marksmanship', 'Survival'] },
  { cls: 'mage', name: 'Mage', specs: ['Arcane', 'Fire', 'Frost'] },
  { cls: 'paladin', name: 'Paladin', specs: ['Holy', 'Protection', 'Retribution'] },
  { cls: 'priest', name: 'Priest', specs: ['Discipline', 'Holy', 'Shadow'] },
  { cls: 'rogue', name: 'Rogue', specs: ['Assassination', 'Combat', 'Subtlety'] },
  { cls: 'shaman', name: 'Shaman', specs: ['Elemental', 'Enhancement', 'Restoration'] },
  { cls: 'warlock', name: 'Warlock', specs: ['Affliction', 'Demonology', 'Destruction'] },
  { cls: 'warrior', name: 'Warrior', specs: ['Arms', 'Fury', 'Protection'] },
];

export const recentRuns: {
  id: string;
  who: string;
  cls: ClassId;
  dps: number;
  engine: string;
  old: boolean;
  when: string;
}[] = [
  {
    id: '#0413',
    who: 'Kargath · top gear',
    cls: 'warrior',
    dps: 1196.8,
    engine: 'v0.0.99',
    old: false,
    when: '8 min',
  },
  { id: '#0412', who: 'Kargath', cls: 'warrior', dps: 1184.2, engine: 'v0.0.99', old: false, when: '12 min' },
  { id: '#0409', who: 'Kargath', cls: 'warrior', dps: 1161.8, engine: 'v0.0.99', old: false, when: '1 h' },
  {
    id: '#0388',
    who: 'Velyth',
    cls: 'warlock',
    dps: 1042.0,
    engine: 'v0.0.97',
    old: true,
    when: 'yesterday',
  },
  { id: '#0351', who: 'Tamsin', cls: 'hunter', dps: 1211.4, engine: 'v0.0.96', old: true, when: '3 days' },
];

export const tuning = (
  [
    ['Survival Hunter', 'hunter', 3.1],
    ['Fury Warrior', 'warrior', 1.9],
    ['Arms Warrior', 'warrior', 1.2],
    ['Combat Rogue', 'rogue', 0.4],
    ['Fire Mage', 'mage', 0.0],
    ['Frost Mage', 'mage', -0.3],
    ['Destruction Warlock', 'warlock', -0.8],
    ['Shadow Priest', 'priest', -1.1],
    ['Enhancement Shaman', 'shaman', 2.4],
    ['Retribution Paladin', 'paladin', -2.6],
    ['Feral Druid', 'druid', 4.2],
    ['Balance Druid', 'druid', -0.5],
  ] as [string, ClassId, number][]
)
  .sort((a, b) => b[2] - a[2])
  .map(([label, marker, value]) => ({ label, marker, value }));

export const syncs = [
  { ver: 'v0.0.99', what: 'build 70862 · 12 items, 3 spells changed', when: '2h ago', current: true },
  { ver: 'v0.0.98', what: 'Feral and Survival rotation fixes', when: 'yesterday', current: false },
  { ver: 'v0.0.97', what: 'build 70691 · hotfixes 10 Nov', when: '2 days ago', current: false },
  { ver: 'v0.0.96', what: 'Retribution seal rework', when: '3 days ago', current: false },
  { ver: 'v0.0.95', what: 'build 70588', when: '5 days ago', current: false },
];
