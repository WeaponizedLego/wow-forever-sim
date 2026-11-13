<script setup lang="ts">
// Start screen (route /): paste an export or pick a spec, see recent runs and what the engine is.
useHead({ title: 'New run · forever/sim' });

const engine = useEngine();
const imp = useStartImport();

watch(imp.text, () => imp.schedule());
// The paste box survives navigation; re-check it if the game data was not there the first time.
onMounted(() => {
  if (imp.text.value.trim() && !imp.result.value) imp.schedule(0);
});

const markers = computed(() => startLineMarkers(imp.text.value, imp.result.value));
const down = computed(() => engine.status.value === 'unavailable' || engine.status.value === 'error');
</script>

<template>
  <main class="page">
    <h1 class="title">New run</h1>
    <p class="lede">
      Paste an export or start from a spec. Everything runs in this browser; nothing is uploaded.
    </p>

    <section v-if="down" class="notice" aria-labelledby="engine-down-h">
      <UiStatusGlyph status="warning" hide-label label="Warning" />
      <div>
        <h2 id="engine-down-h" class="notice__title">
          {{
            engine.status.value === 'unavailable'
              ? 'No engine is staged for this build'
              : 'The engine failed to load'
          }}
        </h2>
        <p class="notice__body">
          <template v-if="engine.status.value === 'unavailable'">
            Pasted exports cannot be checked, because that needs the item data that ships with the engine, and
            nothing can be simmed. Starting from a spec still loads its preset into the workbench.
          </template>
          <template v-else>
            {{ engine.error.value }}. Importing may still work, since the item data loads separately; simming
            will not until the page is reloaded.
          </template>
        </p>
      </div>
    </section>

    <UiPanelGrid>
      <StartInputPanel v-model="imp.text.value" :markers="markers" :span="7" />
      <StartParsedPanel
        :span="5"
        :input="imp.text.value"
        :result="imp.result.value"
        :parsing="imp.parsing.value"
        :parse-error="imp.parseError.value"
      />
      <StartSpecPicker :span="7" />
      <StartRecentRuns :span="5" />
      <StartReferenceDps :span="7" />
      <StartEngineData :span="5" />
    </UiPanelGrid>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 20px var(--space-6) 40px;
}
.title {
  margin: 0 0 4px;
  font-size: var(--text-lg);
  font-weight: 600;
}
.lede {
  margin: 0 0 var(--space-5);
  color: var(--text-2);
}
.notice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: var(--space-5);
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
@media (max-width: 640px) {
  .page {
    padding: var(--space-5) var(--space-5) 32px;
  }
}
</style>
