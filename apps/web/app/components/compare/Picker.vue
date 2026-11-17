<script setup lang="ts">
// Which characters to compare: the current draft and every saved variant, ticked in order. The first
// ticked is the baseline (A); any other can be made the baseline.
import { SPECS } from '@fsim/contracts';
import { COMPARE_LETTERS, COMPARE_MAX, type CompareOption } from '~/composables/compare';
import { talentPoints } from '~/composables/workbench';

const props = defineProps<{ options: CompareOption[]; picked: string[]; disabled: boolean }>();
const emit = defineEmits<{ toggle: [id: string]; baseline: [id: string] }>();

const full = computed(() => props.picked.length >= COMPARE_MAX);
const letter = (id: string) => {
  const i = props.picked.indexOf(id);
  return i < 0 ? null : COMPARE_LETTERS[i];
};
const when = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const detail = (o: CompareOption) =>
  [
    SPECS.find((s) => s.id === o.character.spec)?.name ?? o.character.spec,
    talentPoints(o.character.talents).join('/'),
    o.draft ? 'unsaved, as it is now' : `saved ${when(o.createdAt)}`,
  ].join(' · ');
</script>

<template>
  <ul class="options" aria-label="Variants to compare">
    <li v-for="o in options" :key="o.id" class="option" :class="{ 'is-picked': letter(o.id) }">
      <span class="letter num" :aria-hidden="!letter(o.id)">{{ letter(o.id) ?? '' }}</span>
      <UiCheckbox
        :model-value="!!letter(o.id)"
        :disabled="disabled || (full && !letter(o.id))"
        @update:model-value="emit('toggle', o.id)"
        ><span class="name">{{ o.name }}</span></UiCheckbox
      >
      <span class="num detail">{{ detail(o) }}</span>
      <span class="end">
        <span v-if="letter(o.id) === 'A'" class="base">baseline</span>
        <UiButton
          v-else-if="letter(o.id)"
          size="sm"
          variant="quiet"
          :disabled="disabled"
          :aria-label="`Make ${o.name} the baseline`"
          @click="emit('baseline', o.id)"
          >Make baseline</UiButton
        >
      </span>
    </li>
  </ul>
</template>

<style scoped>
.options {
  margin: 0;
  padding: 0;
  list-style: none;
}
.option {
  display: grid;
  grid-template-columns: 20px minmax(0, max-content) 1fr auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 38px;
  padding: 4px var(--space-4);
  border-top: 1px solid var(--line-row);
}
.option:first-child {
  border-top: 0;
}
.option.is-picked {
  background: var(--bg-row-changed);
}
.letter {
  font-size: var(--text-sm);
  color: var(--text-1);
  text-align: center;
}
.name {
  color: var(--text-1);
}
.detail {
  font-size: var(--text-xs);
  color: var(--text-3);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.end {
  justify-self: end;
}
.base {
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .option {
    grid-template-columns: 20px 1fr auto;
  }
  .detail {
    grid-column: 2 / 4;
    grid-row: 2;
  }
}
</style>
