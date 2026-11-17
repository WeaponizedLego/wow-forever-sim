<script setup lang="ts">
// Shared link (/s#<payload>, utils/share-codec.ts): shows what the link holds, makes its character current,
// and sims it with the link's seed and iterations, which on the same engine gives the sharer's result.
//
// Only the staged engine can run. Loading the engine a link was made with straight from our GitHub
// releases is not possible: github.com/…/releases/download answers with a redirect to
// release-assets.githubusercontent.com, and neither response carries Access-Control-Allow-Origin, so the
// browser blocks the fetch. Older engines would need to be served from our own origin (Phase 4+).
import { CLASSES, ITEM_SLOTS, RACES, SPECS } from '@fsim/contracts';
import type { GameDatabase } from '@fsim/gamedata';
import type { KeyValue } from '~/composables/ui-types';
import { SLOT_LABELS, qualityOf } from '~/composables/workbench';
import { ShareLinkError, decodeShare, type SharePayload } from '~/utils/share-codec';

useHead({ title: 'Shared link · forever/sim' });

const route = useRoute();
const session = useSession();
const engine = useEngine();

const payload = shallowRef<SharePayload | null>(null);
const error = ref<string | null>(null);
const db = shallowRef<GameDatabase | null>(null);

async function load(hash: string) {
  payload.value = null;
  error.value = null;
  try {
    const p = await decodeShare(hash);
    await session.setCharacter(p.character);
    payload.value = p;
  } catch (e) {
    error.value =
      e instanceof ShareLinkError
        ? e.message
        : `The character in the link could not be loaded: ${e instanceof Error ? e.message : String(e)}`;
  }
}
watch(() => route.hash, load, { immediate: true });
onMounted(async () => {
  db.value = await engine.gameDatabase().catch(() => null);
});

const c = computed(() => payload.value?.character ?? null);
const spec = computed(() => SPECS.find((s) => s.id === c.value?.spec));
const stagedId = computed(() => engine.version.value?.engineId ?? null);
const engineDiffers = computed(
  () => !!payload.value && !!stagedId.value && payload.value.engineId !== stagedId.value,
);

const KIND: Record<SharePayload['kind'], string> = {
  single: 'a sim run',
  'stat-weights': 'a stat weights run',
  'top-gear': 'a top gear run',
  draft: 'a workbench draft (not simmed by the sharer)',
};

const items = computed<KeyValue[]>(() => {
  const p = payload.value;
  if (!p) return [];
  const e = p.character.encounter;
  return [
    { label: 'Made with engine', value: p.engineId },
    { label: 'Iterations', value: formatNumber(p.iterations, 0) },
    { label: 'Seed', value: String(p.seed) },
    { label: 'Fight', value: `${e.durationSec}s ±${e.durationVariationSec}s · ${e.targetCount} tgt` },
    { label: 'Talents', value: p.character.talents || '—' },
  ];
});

const gear = computed(() => {
  const ch = c.value;
  if (!ch) return [];
  return ITEM_SLOTS.filter((s) => ch.gear[s]).map((slot) => {
    const g = ch.gear[slot]!;
    const item = db.value?.item(g.itemId);
    return {
      slot: SLOT_LABELS[slot],
      name: itemName(db.value ?? null, g),
      quality: qualityOf(item),
      missing: !!db.value && !item,
    };
  });
});

const progress = computed(() => session.progress.value);
const runError = ref<string | null>(null);
async function simIt() {
  const p = payload.value;
  if (!p || progress.value) return;
  runError.value = null;
  try {
    const entry = await session.runSim({ iterations: p.iterations, seed: p.seed });
    await navigateTo(`/runs/${runSlug(entry.record.id)}`);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError'))
      runError.value = session.lastError.value ?? (e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <main class="page">
    <UiEmptyState v-if="error" title="This share link cannot be opened" :body="error">
      <UiButton variant="primary" to="/">New run</UiButton>
    </UiEmptyState>
    <p v-else-if="!payload || !c" class="loading">Reading the link…</p>

    <template v-else>
      <UiPageHeader
        :title="c.name || spec?.name || 'Character'"
        :subtitle="`· ${RACES[c.race].name} ${spec?.name ?? CLASSES[c.class].name} · ${c.level}`"
        :meta="`shared link · ${KIND[payload.kind]} · nothing in it was sent to a server`"
        :marker="c.class"
        :items="items"
      >
        <template #actions>
          <UiButton to="/workbench">Open in workbench</UiButton>
          <UiButton variant="primary" :disabled="!!progress || !stagedId" @click="simIt">Sim it</UiButton>
        </template>
      </UiPageHeader>

      <section v-if="engineDiffers" class="notice" aria-labelledby="engine-h">
        <UiStatusGlyph status="warning" hide-label label="Warning" />
        <div>
          <h2 id="engine-h" class="notice__title">
            Made with engine {{ payload.engineId }}; this site runs {{ stagedId }}
          </h2>
          <p class="notice__body">
            Simming it here uses {{ stagedId }}, so the result may differ from what the sharer saw: the engine
            or its item data changed in between. The older engine cannot be loaded in the browser.
          </p>
        </div>
      </section>
      <p v-else-if="stagedId" class="same">
        Same engine as the link ({{ stagedId }}): simming with its seed and iterations gives exactly the
        result {{ payload.kind === 'draft' ? 'anyone else gets from this link' : 'the sharer got' }}.
      </p>

      <div v-if="progress" class="progress">
        <UiProgressBar
          label="Simulating"
          :value="progress.fraction ?? undefined"
          :detail="
            progress.total
              ? `${formatNumber(progress.completed, 0)} / ${formatNumber(progress.total, 0)} it`
              : 'starting engine'
          "
        />
        <UiButton @click="session.cancel()">Cancel</UiButton>
      </div>
      <p v-if="runError" class="err" role="alert">
        <UiStatusGlyph status="warning" hide-label />{{ runError }}
      </p>

      <UiPanelGrid>
        <UiPanel title="Gear" :span="12" :meta="`${gear.length} items`">
          <ul class="gear">
            <li v-for="g in gear" :key="g.slot">
              <span class="gear__slot">{{ g.slot }}</span>
              <UiQualityName :quality="g.quality" :missing="g.missing">{{ g.name }}</UiQualityName>
            </li>
          </ul>
        </UiPanel>
      </UiPanelGrid>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) 40px;
}
.loading,
.same {
  margin: var(--space-4) 0;
  color: var(--text-3);
  font-size: var(--text-xs);
}
.notice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: var(--space-4) 0;
  padding: 10px var(--space-4);
  background: var(--status-warning-bg);
  border: 1px solid var(--line-seam);
}
.notice__title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 500;
}
.notice__body {
  margin: 2px 0 0;
  max-width: 80ch;
  color: var(--text-2);
}
.progress {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: var(--space-4) 0;
}
.progress > :first-child {
  flex: 1;
}
.err {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.gear {
  list-style: none;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  columns: 2 280px;
  column-gap: var(--space-6);
}
.gear li {
  display: flex;
  gap: var(--space-3);
  padding: 3px 0;
  break-inside: avoid;
}
.gear__slot {
  flex: 0 0 72px;
  color: var(--text-3);
  font-size: var(--text-xs);
}
@media (max-width: 640px) {
  .page {
    padding: var(--space-5) var(--space-5) 32px;
  }
}
</style>
