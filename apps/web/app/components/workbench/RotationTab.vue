<script setup lang="ts">
// The spec's upstream rotations (APL presets). Simple rotations are listed but cannot be simmed here.
const wb = useWorkbench();
const session = useSession();

const selected = computed(() => {
  const r = wb.draft.value?.rotation;
  return r?.kind === 'preset' ? r.presetId : null;
});
const rotations = computed(() => wb.presets.value?.rotations ?? []);
const current = computed(() => rotations.value.find((r) => r.id === selected.value));

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
        <span v-if="'group' in r && r.group" class="opt__group">{{ r.group }}</span>
        <span class="num opt__kind">{{
          r.kind === 'apl' ? (r.id === selected ? 'selected' : 'APL') : 'simple · not simmable'
        }}</span>
      </label>
    </fieldset>
    <p v-if="!rotations.length" class="note">
      Upstream has no rotation for this spec, so it cannot be simmed.
    </p>
    <p class="note">
      Rotations are upstream's action priority lists (APL) for this spec. Simple rotations are built into an
      APL by the WoWSims site in the browser; this tool cannot sim them yet. Editing the APL is not in this
      version.
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
.note {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
