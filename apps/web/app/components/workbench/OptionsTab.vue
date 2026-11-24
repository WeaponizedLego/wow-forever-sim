<script setup lang="ts">
// The spec's options: what the character brings to the fight besides gear and talents (a Hunter's pet, ammo and
// quiver, a Warlock's demon and armor, a Shaman's weapon imbue). The form is the engine's own list of options
// (@fsim/gamedata specOptionFields), so an option upstream adds shows up here by itself.
// No export carries all of them, so each is shown against upstream's preset build closest to the talents: the
// build an import's options were filled from, and the one a character started from a preset is on.
import {
  buildLabel,
  completeSpecOptions,
  setSpecOption,
  specOptionRows,
  type SpecOptionField,
  type SpecOptionValue,
} from '@fsim/gamedata';
import { specInfo } from '~/composables/workbench';

const wb = useWorkbench();
const session = useSession();

const against = computed(() => {
  const c = wb.draft.value;
  const p = wb.presets.value;
  return c && p?.specId === c.spec ? specOptionRows(c, p) : null;
});
const rows = computed(() => against.value?.rows ?? []);
const changedCount = computed(() => rows.value.filter((r) => r.value !== r.preset).length);
const specName = computed(() => (wb.draft.value ? specInfo(wb.draft.value.spec).name : ''));
/** "SV preset", or the spec's own where it has no builds. */
const presetName = computed(() =>
  against.value?.build ? `${buildLabel(against.value.build)} preset` : `${specName.value} preset`,
);

function set(field: SpecOptionField, value: SpecOptionValue) {
  session.updateCharacter((c) => (c.specOptions = setSpecOption(c.specOptions, field, value)));
}
// The preset's options, each written out like the character's own (see completeSpecOptions).
function reset() {
  const setup = against.value?.setup;
  if (!setup) return;
  session.updateCharacter(
    (c) => (c.specOptions = completeSpecOptions(c.spec, structuredClone(setup.specOptions))),
  );
}
</script>

<template>
  <UiPanel title="Options" :span="8" :row-span="3">
    <template #meta
      ><span v-if="rows.length" class="num" data-testid="options-meta">vs {{ presetName }}</span></template
    >
    <div v-if="rows.length" class="settings" data-testid="spec-options">
      <div class="settings__head">
        <span class="settings__title"
          >{{ specName }} options<template v-if="changedCount"> · {{ changedCount }} changed</template></span
        >
        <UiButton v-if="changedCount" variant="quiet" size="sm" @click="reset"
          >Reset to the {{ presetName }}’s</UiButton
        >
      </div>
      <div class="settings__rows">
        <WorkbenchOptionRow
          v-for="r in rows"
          :key="r.field.key"
          :field="r.field"
          :value="r.value"
          :preset="r.preset"
          @change="set(r.field, $event)"
        />
      </div>
    </div>
    <p v-else-if="against" class="note">{{ specName }} has no options to set.</p>
    <p class="note">
      What the character brings to the fight besides gear and talents, as the engine reads it. No export
      carries all of it: an import takes these from upstream’s preset build closest to its talents (a SimC
      export’s hunter pet is read from the export), and a spec preset starts with its own. “preset:” marks a
      value that differs from the build named above, the closest to the talents now. A change applies to this
      character’s sims and is listed with the pending changes.
    </p>
  </UiPanel>
</template>

<style scoped>
.settings {
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--line-row);
}
.settings__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-height: 24px;
}
.settings__title {
  font-size: var(--text-xs);
  color: var(--text-3);
}
/* A column never asks for more than the panel has, so a phone gets one column instead of a sideways scroll. */
.settings__rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(26em, 100%), 1fr));
  gap: 0 var(--space-6);
  /* Each row keeps to the top of its line, so a neighbour with a "preset:" hint under it does not push it down. */
  align-items: start;
  margin-top: var(--space-2);
}
.note {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
