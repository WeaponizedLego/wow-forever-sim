<script setup lang="ts">
import {
  CLASS_MAX_ARMOR,
  SOURCE_KINDS,
  enchantAppliesToItem,
  itemLevel,
  primarySourceLabel,
} from '@fsim/gamedata';
import type { SourceKind } from '@fsim/gamedata';
import type { GearItem, ItemSlotId } from '@fsim/contracts';
import type { LinearEstimate } from '@fsim/analysis';
import { ArmorType, HandType, ItemQuality, Stat } from '@fsim/proto/common';
import type { UIItem } from '@fsim/proto/ui';
import { SLOT_LABELS, itemName, qualityOf, shortEnchant, specInfo } from '~/composables/workbench';

// Item picker sheet for one slot: search, filters, items this spec can equip, estimated change per item
// (when stat weights exist), then random suffix and enchant for the chosen item, and Equip.
// Keys: "/" focuses the search, Esc closes.
const props = defineProps<{ slotId: ItemSlotId }>();
const emit = defineEmits<{ close: [] }>();

const wb = useWorkbench();
const session = useSession();
const engine = useEngine();

const sheet = ref<HTMLElement | null>(null);
const text = ref('');
const sources = reactive<Record<SourceKind, boolean>>(
  Object.fromEntries(SOURCE_KINDS.map((k) => [k, false])) as Record<SourceKind, boolean>,
);
const QUALITIES = [
  { q: ItemQuality.ItemQualityUncommon, label: 'Uncommon' },
  { q: ItemQuality.ItemQualityRare, label: 'Rare' },
  { q: ItemQuality.ItemQualityEpic, label: 'Epic' },
  { q: ItemQuality.ItemQualityLegendary, label: 'Legendary' },
] as const;
const qualities = reactive<Record<number, boolean>>({});
const minIlvl = ref('');
const maxIlvl = ref('');
/** Hide items above the character's level (required level estimated where the data lacks it). */
const levelCap = ref(true);

const SOURCE_LABELS: Record<SourceKind, string> = {
  raid: 'Raid',
  dungeon: 'Dungeon',
  world: 'World drop',
  crafted: 'Crafted',
  quest: 'Quest',
  vendor: 'Vendor',
  reputation: 'Reputation',
  pvp: 'PvP',
};

const equipped = computed(() => wb.draft.value?.gear[props.slotId]);
const index = shallowRef<Awaited<ReturnType<typeof engine.itemSearch>> | null>(null);
onMounted(async () => {
  index.value = await engine.itemSearch();
});

const LIMIT = 100;
const results = computed<UIItem[]>(() => {
  const c = wb.draft.value;
  if (!index.value || !c) return [];
  const num = (v: string | number) => {
    const s = String(v ?? '').trim(); // a number input's v-model can hand back a number
    return s === '' || !Number.isFinite(Number(s)) ? undefined : Number(s);
  };
  return index.value.search({
    text: text.value,
    slot: props.slotId,
    class: c.class,
    spec: c.spec,
    qualities: QUALITIES.filter((x) => qualities[x.q]).map((x) => x.q),
    sources: SOURCE_KINDS.filter((k) => sources[k]),
    minIlvl: num(minIlvl.value),
    maxIlvl: num(maxIlvl.value),
    ...(levelCap.value && { maxRequiredLevel: c.level }),
    limit: LIMIT,
  });
});

// Equipped item first, then the search results without it.
const list = computed(() => {
  const db = wb.db.value;
  const eq = equipped.value && db?.item(equipped.value.itemId);
  const rest = results.value.filter((i) => i.id !== eq?.id);
  return eq ? [eq, ...rest] : rest;
});

const SHORT: Partial<Record<Stat, string>> = {
  [Stat.StatStrength]: 'Str',
  [Stat.StatAgility]: 'Agi',
  [Stat.StatStamina]: 'Sta',
  [Stat.StatIntellect]: 'Int',
  [Stat.StatSpirit]: 'Spi',
  [Stat.StatSpellDamage]: 'Spell dmg',
  [Stat.StatHealingPower]: 'Healing',
  [Stat.StatAttackPower]: 'AP',
  [Stat.StatRangedAttackPower]: 'RAP',
  [Stat.StatHitRating]: 'Hit',
  [Stat.StatCritRating]: 'Crit',
  [Stat.StatHasteRating]: 'Haste',
  [Stat.StatMP5]: 'MP5',
  [Stat.StatDefenseRating]: 'Def',
  [Stat.StatDodgeRating]: 'Dodge',
  [Stat.StatParryRating]: 'Parry',
  [Stat.StatBlockValue]: 'Block value',
};

function statLine(item: UIItem): string {
  const scaling = item.scalingOptions[0];
  const stats: Record<number, number> = scaling ? scaling.stats : Object.fromEntries(item.stats.entries());
  const parts = Object.entries(stats)
    .filter(([k, v]) => v && SHORT[Number(k) as Stat])
    .map(([k, v]) => `+${v} ${SHORT[Number(k) as Stat]}`);
  const min = scaling?.weaponDamageMin || item.weaponDamageMin;
  const max = scaling?.weaponDamageMax || item.weaponDamageMax;
  if (item.weaponSpeed && max)
    parts.unshift(`${Math.round(min)}–${Math.round(max)} · ${item.weaponSpeed.toFixed(1)} speed`);
  if (item.randomSuffixOptions.length) parts.push(`random suffix (${item.randomSuffixOptions.length})`);
  if (item.setName) parts.push(item.setName);
  return parts.join(' · ') || 'no stats listed';
}

/** The equipped enchant carried over when it fits the new item. */
function keptEnchant(item: UIItem): number | undefined {
  const db = wb.db.value;
  const id = equipped.value?.enchantId;
  if (!db || !id) return undefined;
  const e = db.findEnchant(id, item);
  return e && enchantAppliesToItem(e, item) ? id : undefined;
}

// Estimated change per listed item (vs what is equipped), for the first N rows, when weights exist.
const EST_ROWS = 40;
const estimates = shallowRef<Map<number, LinearEstimate>>(new Map());
let estGen = 0;
watch(
  [list, () => wb.weights.value, () => wb.draft.value],
  async () => {
    const gen = ++estGen;
    const db = wb.db.value;
    const c = wb.draft.value;
    if (!wb.weights.value || !db || !c) {
      estimates.value = new Map();
      return;
    }
    const rows = list.value.slice(0, EST_ROWS).filter((i) => !i.randomSuffixOptions.length);
    const w = wb.weights.value;
    const out = new Map<number, LinearEstimate>();
    await Promise.all(
      rows.map(async (i) => {
        if (i.id === equipped.value?.itemId) return;
        const kept = keptEnchant(i);
        const g: GearItem = { itemId: i.id, ...(kept && { enchantId: kept }) };
        const e = estimateOf(await slotSwap(db, c, props.slotId, g), w);
        if (e) out.set(i.id, e);
      }),
    ).catch(() => undefined);
    if (gen !== estGen) return;
    estimates.value = out;
  },
  { immediate: true },
);

// ---------------------------------------------------------------- selection
const selected = ref<number | null>(equipped.value?.itemId ?? null);
const suffix = ref<number | null>(equipped.value?.randomSuffix ?? null);
const enchant = ref<number | null>(equipped.value?.enchantId ?? null);
const selItem = computed(() => (selected.value ? wb.db.value?.item(selected.value) : undefined));

function choose(item: UIItem) {
  selected.value = item.id;
  const isEquipped = item.id === equipped.value?.itemId;
  suffix.value = isEquipped ? (equipped.value?.randomSuffix ?? null) : null;
  enchant.value = isEquipped ? (equipped.value?.enchantId ?? null) : (keptEnchant(item) ?? null);
}

const suffixOptions = computed(() => {
  const db = wb.db.value;
  return (selItem.value?.randomSuffixOptions ?? []).map((id) => ({
    id,
    name: db?.randomSuffixes.get(id)?.name ?? `Suffix ${id}`,
  }));
});
const enchantOptions = computed(() => {
  const db = wb.db.value;
  if (!db || !selItem.value) return [];
  const seen = new Set<number>();
  return db
    .enchantsForItem(selItem.value)
    .filter((e) => !seen.has(e.effectId) && seen.add(e.effectId))
    .map((e) => {
      const stats = e.stats
        .map((v, i) => (v && SHORT[i as Stat] ? `+${v} ${SHORT[i as Stat]}` : ''))
        .filter(Boolean)
        .join(' ');
      return { id: e.effectId, name: stats ? `${shortEnchant(e.name)} · ${stats}` : shortEnchant(e.name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});
const enchantInList = computed(
  () => enchant.value === null || enchantOptions.value.some((o) => o.id === enchant.value),
);

const choice = computed<GearItem | null>(() => {
  if (!selItem.value) return null;
  if (suffixOptions.value.length && !suffix.value) return null;
  return {
    itemId: selItem.value.id,
    ...(suffix.value && { randomSuffix: suffix.value }),
    ...(enchant.value && { enchantId: enchant.value }),
  };
});
const unchanged = computed(() => {
  const a = choice.value;
  const b = equipped.value;
  return (
    !!a &&
    !!b &&
    a.itemId === b.itemId &&
    (a.randomSuffix ?? 0) === (b.randomSuffix ?? 0) &&
    (a.enchantId ?? 0) === (b.enchantId ?? 0)
  );
});

const choiceEstimate = shallowRef<LinearEstimate | null>(null);
let choiceGen = 0;
watch(
  [choice, () => wb.weights.value],
  async () => {
    const gen = ++choiceGen;
    choiceEstimate.value = null;
    const db = wb.db.value;
    const c = wb.draft.value;
    if (!choice.value || !db || !c || !wb.weights.value) return;
    const d = await slotSwap(db, c, props.slotId, choice.value).catch(() => null);
    if (gen === choiceGen && d) choiceEstimate.value = estimateOf(d, wb.weights.value);
  },
  { immediate: true },
);

const twoHandNote = computed(
  () =>
    props.slotId === 'mainHand' &&
    selItem.value?.handType === HandType.HandTypeTwoHand &&
    !!wb.draft.value?.gear.offHand,
);

function equip() {
  const g = choice.value;
  if (!g) return;
  const slot = props.slotId;
  const clearOff = twoHandNote.value;
  session.updateCharacter((c) => {
    c.gear[slot] = g;
    if (clearOff) delete c.gear.offHand;
  });
  emit('close');
}

function unequip() {
  const slot = props.slotId;
  session.updateCharacter((c) => delete c.gear[slot]);
  emit('close');
}

// ---------------------------------------------------------------- header text
const ARMOR = ['', 'Cloth', 'Leather', 'Mail', 'Plate'];
const who = computed(() => {
  const c = wb.draft.value;
  if (!c) return '';
  const armorSlots: ItemSlotId[] = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'];
  const armor = armorSlots.includes(props.slotId)
    ? `${ARMOR[CLASS_MAX_ARMOR[c.class] as ArmorType]} and lighter · `
    : '';
  return `${armor}usable by ${specInfo(c.spec).name}`;
});
const sourceOf = (i: UIItem) => (wb.db.value ? primarySourceLabel(wb.db.value, i.sources) : '');

// ---------------------------------------------------------------- keys
function searchInput(): HTMLInputElement | null {
  return sheet.value?.querySelector('.search input') ?? null;
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  const t = e.target as HTMLElement | null;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  if (e.key === '/' && !typing) {
    e.preventDefault();
    searchInput()?.focus();
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  nextTick(() => searchInput()?.focus());
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const fmtEst = (e: LinearEstimate) => formatSigned(e.delta, 1);
const estTone = (e: LinearEstimate) => (Math.abs(e.delta) < 0.05 ? 'flat' : e.delta > 0 ? 'up' : 'down');
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <section
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`Pick ${SLOT_LABELS[slotId].toLowerCase()} item`"
    >
      <header class="head">
        <div class="head__row">
          <h2 class="head__title">{{ SLOT_LABELS[slotId] }}</h2>
          <span class="head__who">{{ who }}</span>
          <button type="button" class="close" aria-label="Close" @click="emit('close')">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" />
            </svg>
          </button>
        </div>
        <UiSearchInput
          v-model="text"
          class="search"
          label="Search items"
          placeholder="Search by name"
          kbd="/"
        />
        <div class="filters" role="group" aria-label="Source">
          <UiFilterChip v-for="k in SOURCE_KINDS" :key="k" v-model="sources[k]">{{
            SOURCE_LABELS[k]
          }}</UiFilterChip>
        </div>
        <div class="filters">
          <div class="filters" role="group" aria-label="Quality">
            <UiFilterChip v-for="x in QUALITIES" :key="x.q" v-model="qualities[x.q]">{{
              x.label
            }}</UiFilterChip>
          </div>
          <UiFilterChip v-if="wb.draft.value" v-model="levelCap"
            >Level ≤ {{ wb.draft.value.level }}</UiFilterChip
          >
          <span class="grow" />
          <div class="ilvl">
            <UiTextInput
              v-model="minIlvl"
              label="Min ilvl"
              hide-label
              placeholder="ilvl ≥"
              mono
              type="number"
            />
            <span class="num dash" aria-hidden="true">–</span>
            <UiTextInput v-model="maxIlvl" label="Max ilvl" hide-label placeholder="≤" mono type="number" />
          </div>
        </div>
      </header>

      <div class="cols label" aria-hidden="true">
        <span>Item</span><span class="r">ilvl</span><span class="r">Est. Δ</span>
      </div>
      <ul class="list" aria-label="Items">
        <li v-if="!index" class="msg">Loading the item index…</li>
        <li v-else-if="!list.length" class="msg">No items match. Clear a filter or the search.</li>
        <li v-for="i in list" :key="i.id">
          <button
            type="button"
            class="item"
            :class="{ 'is-selected': i.id === selected, 'is-equipped': i.id === equipped?.itemId }"
            :aria-pressed="i.id === selected"
            @click="choose(i)"
          >
            <span class="item__main">
              <span
                ><span :style="{ color: `var(--quality-${qualityOf(i)})` }">{{
                  i.id === equipped?.itemId && equipped ? itemName(wb.db.value, equipped) : i.name
                }}</span
                ><span v-if="i.id === equipped?.itemId" class="tag">equipped</span></span
              >
              <span class="item__stats">{{ statLine(i) }}</span>
              <span class="item__src">{{ sourceOf(i) }}</span>
            </span>
            <span class="num item__ilvl">{{ itemLevel(i) }}</span>
            <span class="num item__est">
              <template v-if="i.id === equipped?.itemId">{{ wb.weights.value ? '0.0' : '—' }}</template>
              <template v-else-if="estimates.get(i.id)"
                ><span :class="`tone-${estTone(estimates.get(i.id)!)}`">{{
                  fmtEst(estimates.get(i.id)!)
                }}</span></template
              >
              <template v-else-if="wb.weights.value && i.randomSuffixOptions.length"
                ><span class="muted">by suffix</span></template
              >
              <template v-else>—</template>
            </span>
          </button>
        </li>
        <li v-if="results.length >= LIMIT" class="msg">
          First {{ LIMIT }} matches. Narrow the search to see more.
        </li>
      </ul>

      <footer class="foot">
        <div v-if="selItem" class="pickd">
          <div class="pickd__name">
            <span :style="{ color: `var(--quality-${qualityOf(selItem)})` }">{{ selItem.name }}</span>
            <span class="num pickd__est">
              <template v-if="choiceEstimate && !unchanged"
                ><span :class="`tone-${estTone(choiceEstimate)}`">{{ fmtEst(choiceEstimate) }}</span>
                <span class="muted">±{{ formatNumber(choiceEstimate.ci95, 1) }}</span></template
              >
            </span>
          </div>
          <div class="pickd__row">
            <label v-if="suffixOptions.length" class="sel">
              <span class="label">Random suffix</span>
              <select v-model="suffix" class="num">
                <option :value="null" disabled>Pick a suffix</option>
                <option v-for="o in suffixOptions" :key="o.id" :value="o.id">
                  {{ selItem.name }} {{ o.name }}
                </option>
              </select>
            </label>
            <label class="sel">
              <span class="label">Enchant</span>
              <select v-model="enchant">
                <option :value="null">No enchant</option>
                <option v-if="!enchantInList" :value="enchant">Enchant {{ enchant }} (current)</option>
                <option v-for="o in enchantOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
              </select>
            </label>
          </div>
          <p v-if="twoHandNote" class="note">Two-handed: equipping it empties the off hand.</p>
        </div>
        <div class="foot__row">
          <span class="note grow">
            <template v-if="wb.weights.value"
              >Estimates use run {{ wb.weights.value.runId }} stat weights. Sim to confirm.</template
            >
            <template v-else>Run stat weights to see estimated changes.</template>
          </span>
          <UiButton v-if="equipped" variant="quiet" @click="unequip">Unequip</UiButton>
          <UiButton variant="primary" :disabled="!choice || unchanged" @click="equip">Equip</UiButton>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgb(8 9 10 / 62%);
}
.sheet {
  width: min(640px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-left: 1px solid var(--line-control);
  box-shadow: var(--shadow-tooltip);
}
.head {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--line-seam);
}
.head__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.head__title {
  margin: 0;
  flex-grow: 1;
  font-size: var(--text-md);
  font-weight: 600;
}
.head__who {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.close:hover {
  color: var(--text-1);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.grow {
  flex-grow: 1;
}
.ilvl {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ilvl :deep(.input) {
  width: 64px;
}
.dash {
  color: var(--text-3);
}
.cols,
.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px 64px;
  gap: var(--space-3);
}
.cols {
  padding: 6px var(--space-5);
  border-bottom: 1px solid var(--line-seam);
}
.r {
  text-align: right;
}
.list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.msg {
  padding: var(--space-4) var(--space-5);
  font-size: var(--text-sm);
  color: var(--text-3);
}
.item {
  width: 100%;
  align-items: start;
  padding: 8px var(--space-5);
  border: 0;
  border-bottom: 1px solid var(--line-row);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.item:hover {
  background: var(--chart-hover);
}
.item.is-equipped {
  background: var(--bg-row-reference);
}
.item.is-selected {
  background: var(--bg-raised);
  box-shadow: inset 2px 0 0 var(--text-1);
}
.item__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--text-md);
}
.item__stats {
  font-size: var(--text-sm);
  color: var(--text-2);
}
.item__src {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.item__ilvl {
  font-size: var(--text-sm);
  color: var(--text-3);
  text-align: right;
}
.item__est {
  font-size: var(--text-sm);
  text-align: right;
}
.tag {
  margin-left: 8px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.tone-up {
  color: var(--delta-up);
}
.tone-down {
  color: var(--delta-down);
}
.tone-flat,
.muted {
  color: var(--text-3);
}
.foot {
  border-top: 1px solid var(--line-seam);
  background: var(--bg-chrome);
}
.pickd {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5) 0;
}
.pickd__name {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}
.pickd__est {
  font-size: var(--text-sm);
}
.pickd__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.sel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 200px;
  min-width: 0;
}
.sel select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  background: var(--bg-input);
  font-size: var(--text-sm);
}
.foot__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-5);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .head,
  .cols,
  .item,
  .pickd,
  .foot__row {
    padding-left: var(--space-5);
    padding-right: var(--space-5);
  }
  .ilvl :deep(.input) {
    width: 56px;
  }
}
</style>
