<script setup lang="ts">
import type { ClassId } from '@fsim/contracts';
import type { KeyValue } from '~/composables/ui-types';

// Identity marker + title + mono meta line, then key-values, then actions.
// The default slot sits between the title and the key-values (e.g. a TabNav).
withDefaults(
  defineProps<{
    title: string;
    /** Lighter part of the title: "· Fury Warrior". */
    subtitle?: string;
    /** Mono line under the title: "run #0412 · baseline #0409 · 12 Nov 14:02". */
    meta?: string;
    marker?: ClassId;
    items?: KeyValue[];
    /** Heading level; 1 on screens, 2 on the kit page. */
    level?: 1 | 2;
  }>(),
  { subtitle: undefined, meta: undefined, marker: undefined, items: () => [], level: 1 },
);
</script>

<template>
  <section class="head" :aria-label="title">
    <div class="ident">
      <UiClassMarker v-if="marker" :cls="marker" size="lg" />
      <div>
        <component :is="`h${level}`" class="title">
          {{ title }}<span v-if="subtitle" class="title__sub">{{ subtitle }}</span>
        </component>
        <div v-if="meta" class="num meta">{{ meta }}</div>
      </div>
    </div>
    <slot />
    <UiKeyValueStrip v-if="items.length" :items="items" class="kv" />
    <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex-wrap: wrap;
  padding: var(--space-1) 0 var(--space-4);
}
.ident {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.title__sub {
  margin-left: 0.3em;
  font-weight: 400;
  color: var(--text-2);
}
.meta {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.kv {
  flex-grow: 1;
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .head {
    gap: var(--space-3) var(--space-5);
  }
}
</style>
