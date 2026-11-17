<script setup lang="ts">
// One talent tree: header (name, points, reset) and the 4-column grid with prerequisite arrows.
// Left-click or Enter/Space/+ adds a point, right-click, Shift-click or Backspace/Delete/- removes one. The arrow keys
// move between talents (one tab stop per tree). The parent owns the points and the rules (stepTalent). A removal the
// rules refuse says why, in the tooltip and in a status line under the tree (read out by screen readers).
import {
  POINTS_PER_ROW,
  canAddPoint,
  canRemovePoint,
  removePointBlocker,
  talentIconUrl,
  type TalentPoints,
  type TalentTree,
} from '@fsim/gamedata';
import type { ClassId } from '@fsim/contracts';

const props = defineProps<{
  cls: ClassId;
  tree: TalentTree;
  treeIndex: number;
  points: TalentPoints;
  /** This tree's broken talents (points the rules would not allow). */
  broken: boolean[];
}>();
const emit = defineEmits<{ step: [talent: number, delta: 1 | -1]; reset: [] }>();

const CELL = 40;
const GAP = 14;
const COLS = 4;
const ROWS = computed(() => Math.max(7, ...props.tree.talents.map((t) => t.row + 1)));
const width = COLS * CELL + (COLS - 1) * GAP;
const height = computed(() => ROWS.value * CELL + (ROWS.value - 1) * GAP);
const at = (n: number) => n * (CELL + GAP);

const pts = computed(() => props.points[props.treeIndex] ?? []);
const spent = computed(() => pts.value.reduce((a, b) => a + b, 0));
const canAdd = computed(() =>
  props.tree.talents.map((_, i) => canAddPoint(props.cls, props.points, props.treeIndex, i)),
);
const canRemove = computed(() =>
  props.tree.talents.map((_, i) => canRemovePoint(props.cls, props.points, props.treeIndex, i)),
);

/** Why each talent's point cannot come out (null when it can, or it has none). */
const blockers = computed(() =>
  props.tree.talents.map((_, i) => removePointBlocker(props.cls, props.points, props.treeIndex, i)),
);
const help = (i: number) =>
  [canAdd.value[i] && 'Click: add', canRemove.value[i] && 'Right-click: remove'].filter(Boolean).join(' · ');

// The last refused removal, shown under the tree until the next step or a few seconds pass.
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function step(i: number, delta: 1 | -1) {
  const blocker = delta < 0 ? blockers.value[i] : null;
  clearTimeout(noticeTimer);
  notice.value = blocker ?? '';
  if (blocker) noticeTimer = setTimeout(() => (notice.value = ''), 6000);
  else emit('step', i, delta);
}
onBeforeUnmount(() => clearTimeout(noticeTimer));

type State = 'max' | 'partial' | 'open' | 'locked' | 'broken';
const states = computed<State[]>(() =>
  props.tree.talents.map((t, i) => {
    const p = pts.value[i] ?? 0;
    if (props.broken[i]) return 'broken';
    if (p >= t.maxPoints) return 'max';
    if (p > 0) return 'partial';
    return canAdd.value[i] ? 'open' : 'locked';
  }),
);

/** Why a point cannot go in, in words; empty when it can (or the talent is full). */
function requirements(i: number): string[] {
  const t = props.tree.talents[i]!;
  const out: string[] = [];
  const above = props.tree.talents.reduce((a, x, k) => (x.row < t.row ? a + (pts.value[k] ?? 0) : a), 0);
  if (above < t.row * POINTS_PER_ROW)
    out.push(`Requires ${t.row * POINTS_PER_ROW} points in ${props.tree.name}`);
  if (t.prereq !== undefined) {
    const pre = props.tree.talents[t.prereq]!;
    if ((pts.value[t.prereq] ?? 0) < pre.maxPoints)
      out.push(`Requires ${pre.maxPoints} points in ${pre.name}`);
  }
  return out;
}

const arrows = computed(() =>
  props.tree.talents.flatMap((child, i) => {
    if (child.prereq === undefined) return [];
    const parent = props.tree.talents[child.prereq]!;
    const px = at(parent.col) + CELL / 2;
    const py = at(parent.row) + CELL / 2;
    const cx = at(child.col) + CELL / 2;
    let d: string;
    if (parent.row === child.row) d = `M${px} ${py} H${cx}`;
    else if (parent.col === child.col) d = `M${px} ${py + CELL / 2} V${at(child.row)}`;
    else d = `M${px} ${py} H${cx} V${at(child.row)}`;
    const met = (pts.value[child.prereq] ?? 0) >= parent.maxPoints;
    return [{ key: `${child.prereq}-${i}`, d, met }];
  }),
);

// Roving focus: one tab stop per tree, the arrow keys move it.
const focusIdx = ref(0);
const buttons = ref<HTMLButtonElement[]>([]);
function move(from: number, key: string): number {
  const ts = props.tree.talents;
  const t = ts[from]!;
  if (key === 'ArrowLeft') return Math.max(0, from - 1);
  if (key === 'ArrowRight') return Math.min(ts.length - 1, from + 1);
  const rows =
    key === 'ArrowUp' ? [...Array(t.row).keys()].reverse() : [...Array(ROWS.value).keys()].slice(t.row + 1);
  for (const r of rows) {
    const inRow = ts.map((x, k) => ({ x, k })).filter(({ x }) => x.row === r);
    if (!inRow.length) continue;
    inRow.sort((a, b) => Math.abs(a.x.col - t.col) - Math.abs(b.x.col - t.col));
    return inRow[0]!.k;
  }
  return from;
}
function onKey(e: KeyboardEvent, i: number) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    focusIdx.value = move(i, e.key);
    buttons.value[focusIdx.value]?.focus();
  } else if (['Backspace', 'Delete', '-', '_'].includes(e.key)) {
    e.preventDefault();
    step(i, -1);
  } else if (['+', '='].includes(e.key)) {
    e.preventDefault();
    step(i, 1);
  }
}
function onClick(e: MouseEvent, i: number) {
  focusIdx.value = i;
  step(i, e.shiftKey ? -1 : 1);
}
function onContext(i: number) {
  focusIdx.value = i;
  step(i, -1);
}

const failedIcons = ref(new Set<string>());
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
const STATE_WORDS: Record<State, string> = {
  max: 'maxed',
  partial: '',
  open: 'available',
  locked: 'locked',
  broken: 'not allowed by the tree rules',
};
</script>

<template>
  <section class="tree" :aria-label="`${tree.name} tree`" :data-testid="`talent-tree-${treeIndex}`">
    <header class="tree__head">
      <h3 class="tree__name">{{ tree.name }}</h3>
      <span class="num tree__pts" :aria-label="`${spent} points in ${tree.name}`">{{ spent }}</span>
      <UiButton
        variant="quiet"
        size="sm"
        :disabled="spent === 0"
        :aria-label="`Reset ${tree.name}`"
        @click="emit('reset')"
        >Reset</UiButton
      >
    </header>
    <div
      class="tree__grid"
      :style="{ width: `${width}px`, height: `${height}px` }"
      role="group"
      :aria-label="tree.name"
    >
      <svg class="tree__arrows" :width="width" :height="height" aria-hidden="true">
        <path v-for="a in arrows" :key="a.key" :d="a.d" :class="{ met: a.met }" />
      </svg>
      <div
        v-for="(t, i) in tree.talents"
        :key="i"
        class="cell"
        :style="{ left: `${at(t.col)}px`, top: `${at(t.row)}px` }"
      >
        <UiTooltip :placement="t.row < 2 ? 'bottom' : 'top'">
          <template #default="{ describedby }">
            <button
              :ref="(el) => (buttons[i] = el as HTMLButtonElement)"
              type="button"
              class="talent"
              :class="`talent--${states[i]}`"
              :tabindex="focusIdx === i ? 0 : -1"
              :aria-label="`${t.name}, ${pts[i] ?? 0} of ${t.maxPoints}${STATE_WORDS[states[i]!] ? `, ${STATE_WORDS[states[i]!]}` : ''}`"
              :aria-describedby="describedby"
              :aria-disabled="!canAdd[i] && !canRemove[i] ? 'true' : undefined"
              :data-talent="t.name"
              @click="onClick($event, i)"
              @contextmenu.prevent="onContext(i)"
              @keydown="onKey($event, i)"
              @focus="focusIdx = i"
            >
              <img
                v-if="t.icon && !failedIcons.has(t.icon)"
                :src="talentIconUrl(t.icon)"
                alt=""
                width="40"
                height="40"
                loading="lazy"
                draggable="false"
                @error="failedIcons.add(t.icon)"
              />
              <span v-else class="talent__initials" aria-hidden="true">{{ initials(t.name) }}</span>
              <span class="num talent__rank" aria-hidden="true">{{ pts[i] ?? 0 }}/{{ t.maxPoints }}</span>
            </button>
          </template>
          <template #content>
            <strong class="tip__name">{{ t.name }}</strong>
            <span class="tip__rank num">Rank {{ pts[i] ?? 0 }}/{{ t.maxPoints }}</span>
            <span v-for="r in requirements(i)" :key="r" class="tip__req">{{ r }}</span>
            <span v-if="broken[i]" class="tip__req"
              >Its points break the tree rules; the engine still applies them.</span
            >
            <span v-if="blockers[i]" class="tip__req">{{ blockers[i] }}</span>
            <span v-if="help(i)" class="tip__help">{{ help(i) }}</span>
          </template>
        </UiTooltip>
      </div>
    </div>
    <p class="tree__notice" role="status" :data-testid="`talent-notice-${treeIndex}`">{{ notice }}</p>
  </section>
</template>

<style scoped>
.tree {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.tree__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--line-seam);
}
.tree__name {
  flex: 1;
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 500;
}
.tree__pts {
  font-size: var(--text-md);
  color: var(--text-1);
}
.tree__grid {
  position: relative;
  margin: 0 auto;
}
.tree__arrows {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.tree__arrows path {
  fill: none;
  stroke: var(--line-axis);
  stroke-width: 2;
}
.tree__arrows path.met {
  stroke: var(--series-1);
}
.cell {
  position: absolute;
  width: 40px;
  height: 40px;
}
.talent {
  position: relative;
  display: block;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  cursor: pointer;
  user-select: none;
}
.talent img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
}
.talent__initials {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: var(--text-xs);
  color: var(--text-2);
}
.talent__rank {
  position: absolute;
  right: -6px;
  bottom: -7px;
  padding: 0 3px;
  border: 1px solid var(--line-control);
  border-radius: 2px;
  background: var(--bg-app);
  font-size: var(--text-xs);
  line-height: 13px;
  color: var(--text-2);
}
.talent--open {
  border-color: var(--line-axis);
}
.talent--partial {
  border-color: var(--series-1);
}
.talent--partial .talent__rank {
  border-color: var(--series-1);
  color: var(--text-1);
}
.talent--max {
  border-color: var(--status-good);
}
.talent--max .talent__rank {
  border-color: var(--status-good);
  color: var(--text-1);
}
.talent--locked img,
.talent--locked .talent__initials {
  filter: grayscale(1);
  opacity: 0.4;
}
.talent--broken {
  border-color: var(--delta-down);
}
.talent--broken .talent__rank {
  border-color: var(--delta-down);
  color: var(--delta-down);
}
.tree__notice {
  min-height: 1.4em;
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.4;
  color: var(--delta-down);
}
.tip__name,
.tip__rank,
.tip__req,
.tip__help {
  display: block;
}
.tip__name {
  font-weight: 500;
}
.tip__rank {
  color: var(--text-2);
}
.tip__req {
  color: var(--delta-down);
}
.tip__help {
  margin-top: 2px;
  color: var(--text-3);
}
</style>
