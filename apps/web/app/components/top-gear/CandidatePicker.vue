<script setup lang="ts">
// Per slot: what is equipped, the candidates added so far, and an item search to add more.
import type { ItemSlotId } from '@fsim/contracts';
import type { UIItem } from '@fsim/proto/ui';
import { itemLevel } from '@fsim/gamedata';

const props = defineProps<{
  slots: { slot: ItemSlotId; label: string; equipped: number | null; suffix?: number | undefined }[];
  candidates: Partial<Record<ItemSlotId, number[]>>;
  /** Search for items this character can equip in a slot. */
  search: (slot: ItemSlotId, text: string) => Promise<UIItem[]>;
}>();
const emit = defineEmits<{
  add: [slot: ItemSlotId, itemId: number];
  remove: [slot: ItemSlotId, itemId: number];
}>();
const names = useActionNames();

const open = ref<ItemSlotId | null>(null);
const query = ref('');
const results = shallowRef<UIItem[]>([]);
let seq = 0;

async function refresh() {
  const slot = open.value;
  if (!slot) return;
  const n = ++seq;
  const items = await props.search(slot, query.value);
  if (n === seq) results.value = items;
}
watch([open, query], refresh);

function toggle(slot: ItemSlotId) {
  if (open.value === slot) open.value = null;
  else {
    open.value = slot;
    query.value = '';
  }
}
const taken = (slot: ItemSlotId, id: number) =>
  (props.candidates[slot] ?? []).includes(id) || props.slots.find((s) => s.slot === slot)?.equipped === id;
</script>

<template>
  <ul class="slots">
    <li v-for="s in slots" :key="s.slot" class="slot" :class="{ 'slot--open': open === s.slot }">
      <div class="slot__row">
        <span class="slot__name">{{ s.label }}</span>
        <span class="slot__equipped">
          <UiQualityName v-if="s.equipped" :quality="names.itemQuality(s.equipped)">{{
            names.itemName(s.equipped, s.suffix)
          }}</UiQualityName>
          <span v-else class="muted">empty</span>
        </span>
        <span class="slot__cands">
          <span v-for="id in candidates[s.slot] ?? []" :key="id" class="cand">
            <UiQualityName :quality="names.itemQuality(id)">{{ names.itemName(id) }}</UiQualityName>
            <button
              type="button"
              class="cand__x"
              :aria-label="`Remove ${names.itemName(id)}`"
              @click="emit('remove', s.slot, id)"
            >
              ×
            </button>
          </span>
        </span>
        <UiButton size="sm" variant="quiet" :aria-expanded="open === s.slot" @click="toggle(s.slot)">{{
          open === s.slot ? 'Done' : 'Add'
        }}</UiButton>
      </div>
      <div v-if="open === s.slot" class="search">
        <UiSearchInput
          v-model="query"
          :label="`Search ${s.label.toLowerCase()} items`"
          placeholder="Item name"
        />
        <ul class="results">
          <li v-for="item in results" :key="item.id">
            <button
              type="button"
              class="result"
              :disabled="taken(s.slot, item.id)"
              @click="emit('add', s.slot, item.id)"
            >
              <UiQualityName :quality="qualityOf(item.quality)">{{ item.name }}</UiQualityName>
              <span class="num muted">ilvl {{ itemLevel(item) }}</span>
              <span class="num muted">{{ taken(s.slot, item.id) ? 'added' : '+ add' }}</span>
            </button>
          </li>
          <li v-if="results.length === 0" class="muted empty">No equippable items match.</li>
        </ul>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.slots {
  list-style: none;
  margin: 0;
  padding: 0;
}
.slot {
  border-bottom: 1px solid var(--line-row);
}
.slot:last-child {
  border-bottom: 0;
}
.slot__row {
  display: grid;
  grid-template-columns: 78px minmax(0, 1.2fr) minmax(0, 2fr) auto;
  gap: var(--space-3);
  align-items: center;
  padding: 5px var(--space-4);
  min-height: 34px;
}
.slot__name {
  font-size: var(--text-xs);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.slot__equipped {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot__cands {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--space-3);
}
.cand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cand__x {
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  font-size: var(--text-md);
  line-height: 1;
}
.cand__x:hover {
  color: var(--text-1);
}
.search {
  padding: 0 var(--space-4) var(--space-3) calc(78px + var(--space-4) + var(--space-3));
}
.results {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--line-row);
}
.result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 56px;
  gap: var(--space-3);
  width: 100%;
  padding: 5px var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--line-row);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.result:hover:not(:disabled) {
  background: var(--bg-row-hover, var(--bg-chrome));
}
.result:disabled {
  cursor: default;
  opacity: 0.55;
}
.muted {
  color: var(--text-3);
  font-size: var(--text-xs);
}
.empty {
  padding: var(--space-2) var(--space-3);
}
@media (max-width: 640px) {
  .slot__row {
    grid-template-columns: 64px minmax(0, 1fr) auto;
  }
  .slot__cands {
    grid-column: 2 / -1;
    grid-row: 2;
  }
  .search {
    padding-left: var(--space-4);
  }
}
</style>
