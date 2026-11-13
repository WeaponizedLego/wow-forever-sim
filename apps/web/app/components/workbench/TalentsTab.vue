<script setup lang="ts">
import { presetSetup } from '@fsim/gamedata';
import { TALENT_TREES, talentPoints } from '~/composables/workbench';

// Talents as the engine's talent string, plus the spec's preset builds. No tree calculator yet.
const wb = useWorkbench();
const session = useSession();

const current = computed(() => wb.draft.value?.talents ?? '');
const text = ref(current.value);
watch(current, (v) => (text.value = v));

const trees = computed(() => (wb.draft.value ? TALENT_TREES[wb.draft.value.class] : ['', '', '']));
const MAX_POINTS = 51;

const problem = computed(() => {
  const t = text.value.trim();
  if (!t) return 'Enter a talent string.';
  if (!/^[0-5]*(-[0-5]*){0,2}$/.test(t))
    return 'Up to three trees separated by "-", one digit 0–5 per talent.';
  const total = talentPoints(t).reduce((a, b) => a + b, 0);
  if (total > MAX_POINTS) return `${total} points; a level 60 character has ${MAX_POINTS}.`;
  return null;
});
const points = computed(() => talentPoints(problem.value ? current.value : text.value.trim()));
const dirty = computed(() => text.value.trim() !== current.value);

function apply(t = text.value.trim()) {
  if (problem.value && t === text.value.trim()) return;
  session.updateCharacter((c) => (c.talents = t));
}

// Shown while the talents are still the preset ones the import fell back to.
const fromPreset = computed(() => {
  const d = session.importDiagnostics.value.find((x) => x.code === 'DEFAULT-05' && x.field === 'talents');
  const p = wb.presets.value;
  if (!d || !p) return undefined;
  return presetSetup(p, p.defaultBuildId).talents === current.value ? d : undefined;
});
const presets = computed(() => wb.presets.value?.talents ?? []);
</script>

<template>
  <UiPanel title="Talents" :span="8" :row-span="3">
    <template #meta
      ><span class="num">{{ points.join('/') }}</span></template
    >
    <div class="body">
      <p v-if="fromPreset" class="flag">
        <UiStatusGlyph status="warning" hide-label />
        <span
          >The import could not read the talents, so these are the spec preset's.
          <span class="text-3">({{ fromPreset.message }})</span></span
        >
      </p>

      <form class="row" @submit.prevent="apply()">
        <UiTextInput
          v-model="text"
          label="Engine talent string"
          mono
          class="grow"
          :invalid="!!problem"
          :hint="problem ?? 'Digits per talent, trees separated by “-”, as the WoWSims site writes them.'"
        />
        <UiButton type="submit" :disabled="!!problem || !dirty">Apply</UiButton>
      </form>

      <dl class="num trees">
        <div v-for="(t, i) in trees" :key="t">
          <dt class="label">{{ t }}</dt>
          <dd>{{ points[i] }}</dd>
        </div>
        <div>
          <dt class="label">Total</dt>
          <dd>{{ points[0] + points[1] + points[2] }} / {{ MAX_POINTS }}</dd>
        </div>
      </dl>

      <p class="note">
        A clickable talent tree is not in this version. Paste a string, or start from one of the
        <a href="#talent-presets">preset builds</a> below and edit it.
      </p>
    </div>

    <h3 id="talent-presets" class="label sub">Preset builds · {{ presets.length }}</h3>
    <ul v-if="presets.length" class="presets">
      <li v-for="p in presets" :key="p.id" class="preset" :class="{ 'is-current': p.talents === current }">
        <span class="preset__name">{{ p.name }}</span>
        <span class="num preset__pts">{{ talentPoints(p.talents).join('/') }}</span>
        <code class="num preset__str">{{ p.talents }}</code>
        <span v-if="p.talents === current" class="num preset__cur">current</span>
        <UiButton v-else size="sm" @click="apply(p.talents)">Use</UiButton>
      </li>
    </ul>
    <p v-else class="note pad">Upstream has no talent presets for this spec.</p>
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
.row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.row :deep(.btn) {
  margin-top: 19px;
}
.grow {
  flex-grow: 1;
}
.trees {
  display: flex;
  gap: var(--space-6);
  margin: 0;
}
.trees dd {
  margin: 0;
  font-size: var(--text-md);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.note a {
  color: var(--text-2);
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
  grid-template-columns: minmax(120px, 1fr) 72px minmax(0, 2fr) 64px;
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
