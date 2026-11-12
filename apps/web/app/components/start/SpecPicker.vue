<script setup lang="ts">
import type { SpecId } from '@fsim/contracts';
import { defaultCharacter } from '@fsim/gamedata';

// Engine specs grouped by class. A spec starts from its upstream defaults; its preset builds are
// listed under it. Specs upstream has no presets or no rotation for are shown, disabled, with the reason.
defineProps<{ span: number }>();
const session = useSession();

const pending = ref<string | null>(null);
const error = ref<string | null>(null);

async function start(specId: SpecId, buildId?: string) {
  if (pending.value) return;
  pending.value = buildId ? `${specId}/${buildId}` : specId;
  error.value = null;
  try {
    await session.setCharacter(await defaultCharacter(specId, buildId));
    await navigateTo('/workbench');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <UiPanel title="Start from a spec" :span="span">
    <template #meta>
      <span>loads upstream preset gear, talents and rotation</span>
    </template>
    <div class="classes">
      <div v-for="k in START_CLASSES" :key="k.id" class="cls">
        <UiClassMarker :cls="k.id" size="stretch" />
        <div class="cls__body">
          <div class="cls__name">{{ k.name }}</div>
          <ul class="specs">
            <li v-for="s in k.specs" :key="s.id" class="spec">
              <button
                type="button"
                class="spec__btn"
                :disabled="!!s.blocked || !!pending"
                :aria-describedby="s.blocked || s.caveat ? `why-${s.id}` : undefined"
                @click="start(s.id)"
              >
                {{ s.label }}<span v-if="pending === s.id" class="spec__busy"> …</span>
              </button>
              <span v-if="s.blocked" :id="`why-${s.id}`" class="spec__why">{{ s.blocked }}</span>
              <span v-else-if="s.caveat" :id="`why-${s.id}`" class="spec__why spec__why--warn">
                <UiStatusGlyph status="warning" hide-label label="Note" />{{ s.caveat }}</span
              >
              <span v-if="!s.blocked && s.builds.length" class="builds">
                <span class="visually-hidden">Preset builds:</span>
                <button
                  v-for="b in s.builds"
                  :key="b.id"
                  type="button"
                  class="build"
                  :disabled="!!pending"
                  @click="start(s.id, b.id)"
                >
                  {{ b.group && !b.name.includes(b.group) ? `${b.group} ${b.name}` : b.name
                  }}<span v-if="pending === `${s.id}/${b.id}`"> …</span>
                </button>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <p v-if="error" class="error">
      <UiStatusGlyph status="warning" hide-label label="Failed" /> Could not start that spec: {{ error }}
    </p>
  </UiPanel>
</template>

<style scoped>
.classes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--line-row);
}
.cls {
  display: flex;
  gap: 10px;
  padding: 10px var(--space-4);
  background: var(--bg-panel);
  min-width: 0;
}
.cls__body {
  min-width: 0;
}
.cls__name {
  font-size: var(--text-sm);
  color: var(--text-2);
}
.specs {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.spec__btn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-1);
  font-size: var(--text-md);
  text-decoration: underline;
  text-decoration-color: var(--line-axis);
  text-underline-offset: 3px;
  cursor: pointer;
}
.spec__btn:hover:not(:disabled) {
  text-decoration-color: currentColor;
}
.spec__btn:disabled {
  color: var(--text-disabled);
  text-decoration: none;
  cursor: not-allowed;
}
.spec__why {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.builds {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
}
.build {
  padding: 0;
  border: 0;
  background: none;
  font-size: var(--text-xs);
  color: var(--text-3);
  cursor: pointer;
}
.build:hover:not(:disabled) {
  color: var(--text-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.build:disabled {
  cursor: wait;
}
.error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 10px var(--space-4);
  border-top: 1px solid var(--line-row);
  font-size: var(--text-sm);
  color: var(--text-2);
}
@media (max-width: 640px) {
  .classes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .classes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
