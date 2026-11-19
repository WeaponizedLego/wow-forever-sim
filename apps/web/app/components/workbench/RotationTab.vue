<script setup lang="ts">
// The spec's upstream rotations (APL presets). Simple rotations are listed but cannot be simmed here.
// Nothing derives a rotation from the talents, so the tab says which one fits them (the rotation upstream plays
// with the preset build closest to the talents), which builds each rotation belongs to, and what the selected one
// has switched on and off.
import { buildLabel, rotationSwitches } from '@fsim/gamedata';

const wb = useWorkbench();
const session = useSession();

const selected = computed(() => {
  const r = wb.draft.value?.rotation;
  return r?.kind === 'preset' ? r.presetId : null;
});
const rotations = computed(() => wb.presets.value?.rotations ?? []);
const current = computed(() => rotations.value.find((r) => r.id === selected.value));

const advice = computed(() => {
  const c = wb.draft.value;
  const p = wb.presets.value;
  return c && p ? rotationAdvice(c, p) : null;
});
/** Per rotation: the preset builds upstream plays it with ("for MM · SV"), after its group if it has one. */
const usedBy = computed<Record<string, string>>(() => {
  const p = wb.presets.value;
  return Object.fromEntries(
    rotations.value.map((r) => {
      const builds = p ? buildsUsing(p, r.id) : [];
      const parts = [
        'group' in r && r.group ? r.group : '',
        builds.length ? `for ${builds.join(' · ')}` : '',
      ];
      return [r.id, parts.filter(Boolean).join(' · ')];
    }),
  );
});
const adviceText = computed(() => {
  const a = advice.value;
  if (!a) return '';
  const build = buildLabel(a.build);
  if (a.state === 'fits')
    return `Fits these talents: upstream plays its ${build} build, the closest to them, with ${a.suggested.name}.`;
  const closest = `These talents are closest to upstream’s ${build} build, which it plays with ${a.suggested.name}.`;
  return a.state === 'other-build' && a.current
    ? `${closest} ${a.current.name} is its rotation for ${a.currentBuilds.join(', ')}.`
    : closest;
});
const switches = computed(() => (current.value ? rotationSwitches(current.value) : []));

function pick(id: string) {
  session.updateCharacter((c) => (c.rotation = { kind: 'preset', presetId: id }));
}
</script>

<template>
  <UiPanel title="Rotation" :span="8" :row-span="3">
    <template #meta
      ><span class="num">{{
        current?.name ?? (wb.draft.value?.rotation.kind === 'siml' ? 'SIML' : '—')
      }}</span></template
    >
    <p
      v-if="advice"
      class="advice"
      :class="{ 'advice--off': advice.state === 'other-build' }"
      data-testid="rotation-advice"
    >
      <UiStatusGlyph
        :status="advice.state === 'fits' ? 'good' : advice.state === 'other-build' ? 'warning' : 'info'"
        hide-label
      />
      <span class="advice__text">{{ adviceText }}</span>
      <UiButton v-if="advice.state !== 'fits'" size="sm" @click="pick(advice.suggested.id)"
        >Use {{ advice.suggested.name }}</UiButton
      >
    </p>
    <fieldset class="list">
      <legend class="visually-hidden">Rotation preset</legend>
      <label
        v-for="r in rotations"
        :key="r.id"
        class="opt"
        :class="{ 'is-on': r.id === selected, 'is-off': r.kind !== 'apl' }"
      >
        <input
          type="radio"
          name="rotation"
          :value="r.id"
          :checked="r.id === selected"
          :disabled="r.kind !== 'apl'"
          @change="pick(r.id)"
        />
        <span class="opt__name">{{ r.name }}</span>
        <span class="opt__group">{{ usedBy[r.id] }}</span>
        <span class="num opt__kind">{{
          r.kind !== 'apl'
            ? 'simple · not simmable'
            : r.id === selected
              ? 'selected'
              : r.id === advice?.suggested.id
                ? 'fits talents'
                : 'APL'
        }}</span>
      </label>
    </fieldset>
    <div v-if="current && switches.length" class="switches" data-testid="rotation-switches">
      <div class="switches__title">{{ current.name }} settings</div>
      <ul class="switches__list">
        <li v-for="s in switches" :key="s.name" :class="{ 'is-disabled': !s.on }">
          <span>{{ s.name }}</span>
          <span class="num">{{ s.on ? 'on' : 'off' }}</span>
        </li>
      </ul>
      <p class="switches__note">
        These are part of the rotation and cannot be changed here yet: pick the rotation that has them the way
        you play.
      </p>
    </div>
    <p v-if="!rotations.length" class="note">
      Upstream has no rotation for this spec, so it cannot be simmed.
    </p>
    <p class="note">
      Rotations are upstream's action priority lists (APL) for this spec. No export carries one, so an import
      starts on the rotation upstream plays with the preset build closest to its talents. Simple rotations are
      built into an APL by the WoWSims site in the browser; this tool cannot sim them yet. Editing the APL is
      not in this version.
    </p>
  </UiPanel>
</template>

<style scoped>
.list {
  margin: 0;
  padding: 0;
  border: 0;
}
.opt {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: 9px var(--space-4);
  border-bottom: 1px solid var(--line-row);
  cursor: pointer;
}
.opt input {
  margin: 0;
  accent-color: var(--action-bg);
}
.opt.is-on {
  background: var(--bg-raised);
}
.opt.is-off {
  cursor: default;
  color: var(--text-3);
}
.opt__group,
.opt__kind {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.advice {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--line-row);
  font-size: var(--text-sm);
  color: var(--text-2);
}
.advice :deep(.glyph) {
  transform: translateY(2px);
}
.advice--off {
  background: var(--status-warning-bg);
}
.advice__text {
  flex: 1 1 14em;
  min-width: 0;
}
.switches {
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--line-row);
}
.switches__title {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.switches__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15em, 1fr));
  gap: 2px var(--space-4);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-sm);
}
.switches__list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
.switches__list li.is-disabled {
  color: var(--text-3);
}
.switches__note {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.note {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
