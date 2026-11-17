<script setup lang="ts">
// Talents: the class's three trees (click to spend, right-click to take back), the spec's preset builds, and the
// engine talent string for pasting. Everything reads and writes Character.talents (the engine's digit string), so
// share links, the pending diff and sims see each click.
import {
  MAX_TALENT_POINTS,
  brokenTalents,
  classTalents,
  clearTree,
  parseTalents,
  presetSetup,
  serializeTalents,
  stepTalent,
  talentProblems,
  talentsFit,
  totalPoints,
} from '@fsim/gamedata';
import { talentPoints } from '~/composables/workbench';

const wb = useWorkbench();
const session = useSession();

const cls = computed(() => wb.draft.value?.class ?? 'warrior');
const data = computed(() => classTalents(cls.value));
const current = computed(() => wb.draft.value?.talents ?? '');
const points = computed(() => parseTalents(cls.value, current.value));
const broken = computed(() => brokenTalents(cls.value, points.value));
const spent = computed(() => totalPoints(points.value));
const perTree = computed(() => talentPoints(current.value));
const brokenNames = computed(() =>
  broken.value.flatMap((t, ti) => t.flatMap((b, i) => (b ? [data.value.trees[ti]!.talents[i]!.name] : []))),
);

function write(talents: string) {
  if (talents !== current.value) session.updateCharacter((c) => (c.talents = talents));
}
function step(tree: number, talent: number, delta: 1 | -1) {
  const next = stepTalent(cls.value, points.value, tree, talent, delta);
  if (next !== points.value) write(serializeTalents(next));
}
function reset(tree: number) {
  write(serializeTalents(clearTree(points.value, tree)));
}

// Raw string (advanced). Broken rows are allowed (upstream allows them; the trees flag them), a string that does
// not fit the class or spends more than 51 points is not.
const text = ref(current.value);
watch(current, (v) => (text.value = v));
const problems = computed(() => talentProblems(cls.value, text.value.trim()));
const blocking = computed(() => {
  const t = text.value.trim();
  if (!talentsFit(cls.value, t)) return problems.value[0] ?? 'Does not fit this class’s trees.';
  return totalPoints(parseTalents(cls.value, t)) > MAX_TALENT_POINTS ? problems.value[0]! : null;
});
const dirty = computed(() => text.value.trim() !== current.value);
function apply() {
  if (!blocking.value) write(text.value.trim());
}

// Import findings about the talents: the preset fallback (while the talents are still the preset's), or a
// conversion from the game's loadout string that could not be verified.
const importNote = computed(() => {
  const d = session.importDiagnostics.value.find((x) => x.field === 'talents' && x.severity === 'warning');
  if (!d) return undefined;
  if (d.code === 'DEFAULT-05') {
    const p = wb.presets.value;
    if (!p || presetSetup(p, p.defaultBuildId).talents !== current.value) return undefined;
    return {
      lead: 'The import could not read the talents, so these are the spec preset’s.',
      detail: d.message,
    };
  }
  return { lead: 'Check these talents against the character in game.', detail: d.message };
});
const presets = computed(() => wb.presets.value?.talents ?? []);
</script>

<template>
  <UiPanel title="Talents" :span="8" :row-span="3">
    <template #meta
      ><span class="num" data-testid="talent-total"
        >{{ perTree.join('/') }} · {{ spent }}/{{ MAX_TALENT_POINTS }}</span
      ></template
    >
    <div class="body">
      <p v-if="importNote" class="flag">
        <UiStatusGlyph status="warning" hide-label />
        <span
          >{{ importNote.lead }} <span class="text-3">({{ importNote.detail }})</span></span
        >
      </p>

      <p class="summary">
        <span class="num"
          ><strong>{{ MAX_TALENT_POINTS - spent }}</strong> points left</span
        >
        <span class="text-3"
          >Click to add a point, right-click or Shift-click to remove. Arrow keys move, Backspace
          removes.</span
        >
      </p>

      <div class="trees">
        <TalentsTree
          v-for="(tree, ti) in data.trees"
          :key="`${cls}-${ti}`"
          :cls="cls"
          :tree="tree"
          :tree-index="ti"
          :points="points"
          :broken="broken[ti] ?? []"
          @step="(i, d) => step(ti, i, d)"
          @reset="reset(ti)"
        />
      </div>

      <p v-if="brokenNames.length" class="flag">
        <UiStatusGlyph status="warning" hide-label />
        <span
          >These talents hold points the tree rules would not allow (a row or prerequisite short):
          {{ brokenNames.join(', ') }}. The engine still applies them.</span
        >
      </p>
    </div>

    <h3 id="talent-presets" class="label sub">Preset builds · {{ presets.length }}</h3>
    <ul v-if="presets.length" class="presets">
      <li v-for="p in presets" :key="p.id" class="preset" :class="{ 'is-current': p.talents === current }">
        <span class="preset__name">{{ p.name }}</span>
        <span class="num preset__pts">{{ talentPoints(p.talents).join('/') }}</span>
        <code class="num preset__str">{{ p.talents }}</code>
        <span v-if="p.talents === current" class="num preset__cur">current</span>
        <UiButton v-else size="sm" @click="write(p.talents)">Use</UiButton>
      </li>
    </ul>
    <p v-else class="note pad">Upstream has no talent presets for this spec.</p>

    <details class="advanced">
      <summary class="label">Engine talent string</summary>
      <form class="row" @submit.prevent="apply()">
        <UiTextInput
          v-model="text"
          label="Engine talent string"
          hide-label
          mono
          class="grow"
          :invalid="!!blocking"
          :hint="
            blocking ??
            problems[0] ??
            'Digits per talent, trees separated by “-”, as the WoWSims site writes them. Share links carry it.'
          "
        />
        <UiButton type="submit" :disabled="!!blocking || !dirty">Apply</UiButton>
      </form>
    </details>
  </UiPanel>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}
.flag {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--status-warning-bg);
  border-left: 2px solid var(--status-warning);
  font-size: var(--text-sm);
}
.text-3 {
  color: var(--text-3);
}
.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  margin: 0;
  font-size: var(--text-xs);
}
.summary strong {
  font-size: var(--text-md);
  font-weight: 500;
}
.trees {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(214px, 1fr));
  gap: var(--space-6) var(--space-5);
  padding-bottom: var(--space-2);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.pad {
  padding: 0 var(--space-4) var(--space-4);
}
.sub {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--line-seam);
  border-bottom: 1px solid var(--line-seam);
  font-weight: 400;
}
.presets {
  margin: 0;
  padding: 0;
  list-style: none;
}
.preset {
  display: grid;
  grid-template-columns: minmax(9.25em, 1fr) 5.5em minmax(0, 2fr) 5em;
  gap: var(--space-3);
  align-items: center;
  padding: 7px var(--space-4);
  border-bottom: 1px solid var(--line-row);
  font-size: var(--text-sm);
}
.preset.is-current {
  background: var(--bg-row-reference);
}
.preset__pts {
  color: var(--text-2);
}
.preset__str {
  font-size: var(--text-xs);
  color: var(--text-3);
  overflow-wrap: anywhere;
}
.preset__cur {
  font-size: var(--text-xs);
  color: var(--text-3);
  text-align: center;
}
.advanced {
  padding: var(--space-2) var(--space-4) var(--space-4);
}
.advanced summary {
  cursor: pointer;
  padding: var(--space-1) 0 var(--space-2);
}
.row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.grow {
  flex-grow: 1;
}
@media (max-width: 640px) {
  .preset {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .preset__pts {
    display: none;
  }
  .preset__str {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
