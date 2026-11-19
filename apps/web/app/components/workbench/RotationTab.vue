<script setup lang="ts">
// The spec's upstream rotations (APL presets). Simple rotations are listed but cannot be simmed here.
// Nothing derives a rotation from the talents, so the tab says which one fits them (the rotation upstream plays
// with the preset build closest to the talents), which builds each rotation belongs to, and what the selected one
// has switched on and off. Those on/off settings can be changed: the changes are kept on the character
// (`rotation.switches`) and written into the rotation when it is simmed.
import { buildLabel, rotationSwitches, setRotationSwitch } from '@fsim/gamedata';

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
const switches = computed(() => {
  const c = wb.draft.value;
  const preset = current.value;
  if (!c || !preset || c.rotation.kind !== 'preset') return [];
  return rotationSwitches(preset, c.rotation.switches).map((s) => ({
    ...s,
    talent: switchTalentNote(c, s),
  }));
});
const changedCount = computed(() => switches.value.filter((s) => s.on !== s.preset).length);

// Another rotation starts from its own settings: the changes belong to the rotation they were made in.
function pick(id: string) {
  session.updateCharacter((c) => (c.rotation = { kind: 'preset', presetId: id }));
}
function setSwitch(name: string, on: boolean) {
  const preset = current.value;
  if (!preset) return;
  session.updateCharacter((c) => {
    if (c.rotation.kind !== 'preset') return;
    const changed = setRotationSwitch(preset, c.rotation.switches, name, on);
    c.rotation = { kind: 'preset', presetId: preset.id, ...(changed && { switches: changed }) };
  });
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
      <div class="switches__head">
        <span class="switches__title"
          >{{ current.name }} settings<template v-if="changedCount">
            · {{ changedCount }} changed</template
          ></span
        >
        <UiButton v-if="changedCount" variant="quiet" size="sm" @click="pick(current.id)"
          >Reset to {{ current.name }}’s own</UiButton
        >
      </div>
      <ul class="switches__list">
        <li v-for="s in switches" :key="s.name" :class="{ 'is-changed': s.on !== s.preset }">
          <UiCheckbox :model-value="s.on" @update:model-value="setSwitch(s.name, $event)">{{
            s.name
          }}</UiCheckbox>
          <span v-if="s.talent === 'unused'" class="switches__hint switches__hint--warn"
            >talent taken, not cast</span
          >
          <span v-else-if="s.talent === 'untaken'" class="switches__hint">talent not taken</span>
          <span v-if="s.on !== s.preset" class="switches__hint">was {{ s.preset ? 'on' : 'off' }}</span>
        </li>
      </ul>
      <p class="switches__note">
        What the rotation casts or does. A change applies to this character’s sims and is listed with the
        pending changes; picking another rotation starts from that rotation’s own settings.
      </p>
    </div>
    <p v-if="!rotations.length" class="note">
      Upstream has no rotation for this spec, so it cannot be simmed.
    </p>
    <p class="note">
      Rotations are upstream's action priority lists (APL) for this spec. No export carries one, so an import
      starts on the rotation upstream plays with the preset build closest to its talents. Simple rotations are
      built into an APL by the WoWSims site in the browser; this tool cannot sim them yet. A rotation’s on/off
      settings can be changed above; editing the priority list itself is not in this version.
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
.switches__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-height: 24px;
}
.switches__title {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.switches__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17em, 1fr));
  gap: 0 var(--space-4);
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}
/* The label is the click target: room around it instead of a gap between rows. */
.switches__list :deep(.check) {
  padding: var(--space-1) 0;
}
.switches__list li {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 var(--space-2);
}
.switches__list li.is-changed :deep(.check) {
  color: var(--text-1);
}
.switches__hint {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.switches__hint--warn {
  color: var(--status-warning);
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
