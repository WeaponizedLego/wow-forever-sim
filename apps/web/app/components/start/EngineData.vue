<script setup lang="ts">
// Which engine and data build this page sims with, where they came from, and what they were checked against.
defineProps<{ span: number }>();
const engine = useEngine();

const lock = START_LOCK;
const baseline = START_BASELINE;
const staged = computed(() => engine.staged.value);
const commit = computed(() => staged.value?.commit ?? lock.upstream.commit);
const commitUrl = computed(() => `https://github.com/${lock.upstream.repo}/commit/${commit.value}`);
const sameAsLock = computed(() => commit.value === lock.upstream.commit);

const state = computed(() => {
  switch (engine.status.value) {
    case 'ready':
      return { tone: 'good' as const, text: 'loaded' };
    case 'loading':
      return { tone: 'info' as const, text: 'loading' };
    case 'unavailable':
      return { tone: 'warning' as const, text: 'not staged' };
    case 'error':
      return { tone: 'warning' as const, text: 'failed to load' };
    default:
      return staged.value
        ? { tone: 'good' as const, text: 'staged, loads on first sim' }
        : { tone: 'info' as const, text: 'checking' };
  }
});

const profiles = Object.keys(baseline.specs).length;
const skipped = Object.keys(baseline.skipped ?? {}).length;
</script>

<template>
  <UiPanel title="Engine &amp; data" :span="span">
    <template #meta>
      <a :href="`https://github.com/${lock.upstream.repo}/commits`" class="meta-link">Upstream history</a>
    </template>
    <dl class="kv">
      <div class="kv__row">
        <dt>Engine</dt>
        <dd>
          <UiStatusGlyph :status="state.tone" label="Engine status" hide-label />
          <span class="num">{{ staged?.engineId ?? lock.engineId }}</span>
          <span class="dim">{{ state.text }}</span>
        </dd>
      </div>
      <div class="kv__row">
        <dt>Source</dt>
        <dd>
          <template v-if="staged">{{
            staged.source === 'local' ? 'local build (packages/engine/vendor)' : 'release artifacts'
          }}</template>
          <span v-else class="dim">nothing staged</span>
        </dd>
      </div>
      <div class="kv__row">
        <dt>Upstream</dt>
        <dd>
          <a :href="commitUrl" class="num">{{ lock.upstream.repo }}@{{ commit.slice(0, 7) }}</a>
          <span v-if="sameAsLock" class="dim">committed {{ startDate(lock.upstream.committedAt) }}</span>
        </dd>
      </div>
      <div class="kv__row">
        <dt>Data build</dt>
        <dd class="num">{{ staged ? (staged.dataBuild ?? 'unknown') : (lock.dataBuild ?? 'unknown') }}</dd>
      </div>
      <div class="kv__row">
        <dt>Synced</dt>
        <dd>{{ startDate(lock.syncedAt) }}</dd>
      </div>
      <div class="kv__row">
        <dt>Presets</dt>
        <dd>
          <span class="num">{{ START_PRESET_COMMIT.slice(0, 7) }}</span>
          <span class="dim">gear, talents, rotations from upstream</span>
        </dd>
      </div>
      <div class="kv__row">
        <dt>Reference</dt>
        <dd>
          <span class="num"
            >{{ profiles }} profiles · smoke gate ±{{ formatNumber(baseline.tolerance * 100, 0) }}%</span
          >
          <span class="dim">{{ skipped }} suites without a raid sim</span>
        </dd>
      </div>
    </dl>
    <p class="foot num">
      engine pinned in engine.lock.json · reference simmed {{ startDate(baseline.generatedAt) }}
    </p>
  </UiPanel>
</template>

<style scoped>
.meta-link {
  color: var(--text-2);
}
.kv {
  margin: 0;
  padding: 4px 0;
}
.kv__row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
  padding: 7px var(--space-4);
  font-size: var(--text-sm);
}
dt {
  color: var(--text-3);
}
dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}
.dim {
  color: var(--text-3);
}
.foot {
  margin: 0;
  padding: 8px var(--space-4) 12px;
  border-top: 1px solid var(--line-row);
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
