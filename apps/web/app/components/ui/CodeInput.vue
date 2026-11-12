<script setup lang="ts">
import type { LineMarker } from '~/composables/ui-types';

// Paste box with a line-number gutter and per-line markers (✓ recognised, ! problem, i note).
// A real <textarea> sits on top of a highlighted copy of the text (transparent text, visible caret),
// so typing, paste, undo and selection are native. Lines don't wrap; the box scrolls.
const props = withDefaults(
  defineProps<{
    label: string;
    markers?: Record<number, LineMarker>;
    placeholder?: string;
    /** Max visible lines before the box scrolls. */
    rows?: number;
  }>(),
  { markers: () => ({}), placeholder: undefined, rows: 16 },
);
const model = defineModel<string>({ default: '' });
const id = useId();

const lines = computed(() => model.value.split('\n'));
const longest = computed(() => lines.value.reduce((m, l) => Math.max(m, l.length), 0));
const glyph: Record<LineMarker['status'], string> = { good: '✓', warning: '!', info: 'i' };
const notes = computed(() =>
  Object.entries(props.markers)
    .filter(([, m]) => m.message)
    .map(([n, m]) => `Line ${n}, ${m.status === 'good' ? 'ok' : m.status}: ${m.message}`),
);
</script>

<template>
  <div class="code-wrap">
    <label :for="id" class="visually-hidden">{{ label }}</label>
    <div class="code num" :style="{ maxHeight: `${rows * 22 + 16}px` }">
      <div class="code__inner" :style="{ minWidth: `calc(${longest}ch + 76px)` }">
        <div class="code__gutter" aria-hidden="true">
          <div
            v-for="(_, i) in lines"
            :key="i"
            class="code__gline"
            :class="markers[i + 1] && `is-${markers[i + 1]!.status}`"
          >
            <span class="code__n">{{ i + 1 }}</span>
            <span class="code__mark">{{ markers[i + 1] ? glyph[markers[i + 1]!.status] : '' }}</span>
          </div>
        </div>
        <div class="code__area">
          <div class="code__backdrop" aria-hidden="true">
            <div
              v-for="(line, i) in lines"
              :key="i"
              class="code__line"
              :class="[
                markers[i + 1] && `is-${markers[i + 1]!.status}`,
                { 'is-comment': line.startsWith('#') },
              ]"
              v-text="line || ' '"
            />
          </div>
          <textarea
            :id="id"
            v-model="model"
            class="code__textarea"
            wrap="off"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            :rows="lines.length"
            :placeholder="placeholder"
            :aria-describedby="notes.length ? `${id}-notes` : undefined"
          />
        </div>
      </div>
    </div>
    <ul v-if="notes.length" :id="`${id}-notes`" class="visually-hidden">
      <li v-for="n in notes" :key="n">{{ n }}</li>
    </ul>
  </div>
</template>

<style scoped>
.code-wrap {
  position: relative;
}
.code {
  --line: 22px;
  position: relative;
  overflow: auto;
  font-size: var(--text-sm);
  line-height: var(--line);
}
.code:focus-within {
  outline: 2px solid var(--series-1);
  outline-offset: -2px;
}
.code__inner {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  padding: var(--space-2) 0;
}
.code__gutter {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--bg-panel);
}
.code__gline {
  display: grid;
  grid-template-columns: 40px 18px;
  height: var(--line);
}
.code__n {
  text-align: right;
  padding-right: 10px;
  color: var(--text-gutter);
}
.code__area {
  position: relative;
}
.code__line {
  height: var(--line);
  padding-right: var(--space-4);
  white-space: pre;
  color: var(--text-code);
}
.code__line.is-comment {
  color: var(--text-disabled);
}
.is-good .code__mark {
  color: var(--status-good);
}
.is-info .code__mark {
  color: var(--status-info);
}
.is-warning .code__mark {
  color: var(--status-warning);
}
.code__gline.is-warning,
.code__line.is-warning {
  background: var(--status-warning-bg);
}
.code__textarea {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  resize: none;
  overflow: hidden;
  background: transparent;
  color: transparent;
  caret-color: var(--text-1);
  font: inherit;
  line-height: var(--line);
  white-space: pre;
}
.code__textarea::placeholder {
  color: var(--text-3);
}
.code__textarea::selection {
  background: var(--delta-up-bg);
}
</style>
