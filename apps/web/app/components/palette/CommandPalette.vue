<script setup lang="ts">
import type { Character, ItemSlotId, RunRecord } from '@fsim/contracts';
import { defaultCharacter, itemLevel, itemSlots, slotId, type ItemSearchIndex } from '@fsim/gamedata';
import type { UIItem } from '@fsim/proto/ui';
import type { Command } from '~/composables/commands';
import type { NavItem } from '~/composables/ui-types';
import { runSlug } from '~/composables/analysis';
import { SLOT_LABELS, weightPlan } from '~/composables/workbench';

// ⌘K command palette: one search over pages (the layout's nav), actions, items, spec presets and recent runs,
// plus whatever the current page registers (useCommandSource). A modal combobox: the input keeps focus, ↑/↓
// move the active option (aria-activedescendant), ↵ runs it, Esc closes and focus goes back where it was.
// Loaded on first open (LazyPaletteCommandPalette), so none of this is in the first page load.
const props = defineProps<{ nav: NavItem[] }>();

const palette = usePalette();
const session = useSession();
const engine = useEngine();
const route = useRoute();

const query = ref('');
const active = ref(0);
const message = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const listId = useId();

// ---------------------------------------------------------------- built-in commands

const draft = computed(() => session.character.value);
const needsDraft = computed(() => (draft.value ? null : 'Start a character first'));
const busy = computed(() => (session.progress.value ? 'A sim is running' : null));

/** Waits until a command with this id is registered (the page that registers it has mounted). */
async function registered(id: string, ms = 5000): Promise<Command | undefined> {
  const t0 = Date.now();
  for (;;) {
    const c = registeredCommands().find((x) => x.id === id);
    if (c || Date.now() - t0 > ms) return c;
    await new Promise((r) => setTimeout(r, 50));
  }
}

const navCommands = computed<Command[]>(() =>
  props.nav.map((n) => ({
    id: `nav:${n.label}`,
    section: 'Navigation',
    label: n.label,
    detail: n.to,
    keywords: ['go to', 'open', 'page'],
    suggested: true,
    run: () => navigateTo(n.to),
  })),
);

const actionCommands = computed<Command[]>(() => {
  const latest = session.latest.value;
  const onRun = route.path.startsWith('/runs/')
    ? (session.run(`#${String(route.params.id ?? '')}`) as { record: RunRecord } | null)
    : null;
  return [
    {
      id: 'sim.run',
      section: 'Actions',
      label: 'Run sim',
      detail: 'in the workbench',
      keywords: ['simulate', 'dps', 'start sim'],
      kbd: '⌘↵',
      suggested: true,
      disabled: needsDraft.value ?? busy.value,
      // The workbench sim bar registers the real command; go there and run it.
      run: async () => {
        await navigateTo('/workbench');
        await (await registered('sim.run'))?.run();
      },
    },
    {
      id: 'sim.weights',
      section: 'Actions',
      label: 'Run stat weights',
      detail: latest ? `for run ${latest.record.id}` : undefined,
      keywords: ['ep', 'weights', 'stat values'],
      suggested: true,
      disabled: needsDraft.value ?? busy.value ?? (latest ? null : 'Run a sim first'),
      run: async () => {
        const c = draft.value;
        const entry = session.latest.value;
        if (!c || !entry) return;
        await navigateTo('/workbench');
        const plan = weightPlan(c.spec);
        await session
          .runStatWeights(plan.stats, plan.reference, { pseudoStats: plan.pseudoStats })
          .then(() => navigateTo(`/runs/${runSlug(entry.record.id)}`))
          .catch(() => undefined); // the sim bar shows session.lastError
      },
    },
    {
      id: 'new',
      section: 'Actions',
      label: 'New run or import',
      detail: 'SimC, WoWSims, Wowhead',
      keywords: ['import', 'paste', 'simc', 'wowhead', 'wowsims', 'start'],
      suggested: true,
      run: async () => {
        await navigateTo('/');
        await nextTick();
        document.querySelector<HTMLElement>('[aria-label="Pasted export"]')?.focus();
      },
    },
    {
      id: 'share',
      section: 'Actions',
      label: onRun ? `Copy share link for run ${onRun.record.id}` : 'Copy share link for the draft',
      keywords: ['share', 'link', 'url', 'copy'],
      suggested: true,
      disabled: onRun || draft.value ? null : 'Nothing to share yet',
      feedback: true,
      run: () => copyShareLink(onRun?.record ?? null),
    },
    {
      id: 'runs',
      section: 'Actions',
      label: 'Open recent runs',
      detail: '/runs',
      keywords: ['history', 'results', 'analysis'],
      disabled: latest ? null : 'No runs yet',
      run: () => navigateTo('/runs'),
    },
  ];
});

/** Copies a /s#… link for the run, else for the draft (5,000 iterations, fixed seed), like the Share buttons. */
async function copyShareLink(run: RunRecord | null): Promise<string> {
  const engineId = engine.version.value?.engineId;
  const c = draft.value as Character | null;
  const payload = run
    ? sharePayloadForRun(run)
    : c && engineId
      ? {
          character: c,
          iterations: 5000,
          seed: Math.floor(Math.random() * 2 ** 31),
          engineId,
          kind: 'draft' as const,
        }
      : null;
  if (!payload) return 'Nothing to share yet';
  const url = await shareUrl(payload);
  try {
    await navigator.clipboard.writeText(url);
    return 'Share link copied';
  } catch {
    window.prompt('Copy this share link', url);
    return '';
  }
}

const specCommands = computed<Command[]>(() =>
  START_CLASSES.flatMap((k) =>
    k.specs.map((s) => ({
      id: `spec:${s.id}`,
      section: 'Specs',
      label: startSpecName(s.id),
      detail: s.blocked ?? 'new character from the preset',
      keywords: [k.name, s.label, 'start', 'new character'],
      disabled: s.blocked,
      run: async () => {
        await session.setCharacter(await defaultCharacter(s.id));
        await navigateTo('/workbench');
      },
    })),
  ),
);

const now = Date.now();
const runCommands = computed<Command[]>(() =>
  session.runs.value.map(({ record: r }, i) => ({
    id: `run:${r.id}`,
    section: 'Recent runs',
    label: `${r.id} ${r.character.name || startSpecName(r.character.spec)}`,
    detail: `${formatNumber(r.summary.dpsMean, 1)} DPS · ${startAgo(r.createdAt, now)}`,
    keywords: [startSpecName(r.character.spec), r.kind],
    suggested: i < 3,
    run: () => navigateTo(`/runs/${runSlug(r.id)}`),
  })),
);

// ---------------------------------------------------------------- items (index loaded on first item search)

const index = shallowRef<ItemSearchIndex | null>(null);
const itemState = ref<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
const itemQuery = computed(() => query.value.trim());
watch(itemQuery, (q) => {
  if (q.length < 2 || itemState.value !== 'idle') return;
  itemState.value = 'loading';
  engine
    .itemSearch()
    .then((i) => {
      index.value = i;
      itemState.value = 'ready';
    })
    .catch(() => (itemState.value = 'unavailable'));
});

/** The slot an item goes in: the first of its slots, or the first empty one for rings, trinkets, one-handers. */
function slotFor(item: UIItem): ItemSlotId | null {
  const slots = itemSlots(item).map(slotId);
  return slots.find((s) => !draft.value?.gear[s]) ?? slots[0] ?? null;
}

const ITEM_LIMIT = 8;
const itemCommands = computed<Command[]>(() => {
  const q = itemQuery.value;
  if (!index.value || q.length < 2) return [];
  const c = draft.value;
  return index.value
    .search({ text: q, limit: ITEM_LIMIT, ...(c && { class: c.class, spec: c.spec }) })
    .flatMap((item) => {
      const slot = slotFor(item);
      if (!slot) return [];
      return [
        {
          id: `item:${item.id}`,
          section: 'Items',
          label: item.name,
          detail: `${SLOT_LABELS[slot]} · ilvl ${itemLevel(item)}`,
          disabled: needsDraft.value && 'Start a character to equip items',
          run: () => navigateTo({ path: '/workbench', query: { pick: slot, item: String(item.id) } }),
        },
      ];
    });
});

// ---------------------------------------------------------------- results

const SECTION_ORDER = ['Actions', 'Navigation', 'Recent runs', 'Items', 'Specs'];
const SECTION_LIMIT: Record<string, number> = { Actions: 6, Specs: 6, 'Recent runs': 5 };

interface Option {
  command: Command;
  positions: number[];
  domId: string;
}
interface Group {
  section: string;
  options: Option[];
}

const groups = computed<Group[]>(() => {
  // Built-ins, then registered commands replacing built-ins with the same id.
  const extra = registeredCommands();
  const ids = new Set(extra.map((c) => c.id));
  const all = [
    ...[...actionCommands.value, ...navCommands.value, ...runCommands.value, ...specCommands.value].filter(
      (c) => !ids.has(c.id),
    ),
    ...extra,
  ];
  const q = query.value;
  const ranked = q.trim()
    ? fuzzyRank(q, all, (c) => ({ label: c.label, keywords: [c.section, ...(c.keywords ?? [])] }))
    : all.filter((c) => c.suggested).map((c) => ({ item: c, score: 0, positions: [] as number[] }));
  // Items come pre-filtered by the index (every word in the name); rank them after a perfect label hit.
  for (const c of itemCommands.value) {
    const m = fuzzyMatch(q, c.label);
    ranked.push({ item: c, score: m ? m.score - 100 : 0, positions: m?.positions ?? [] });
  }

  const bySection = new Map<string, { best: number; options: Option[] }>();
  for (const r of ranked) {
    const s = bySection.get(r.item.section) ?? { best: r.score, options: [] };
    bySection.set(r.item.section, s);
    if (s.options.length >= (SECTION_LIMIT[r.item.section] ?? ITEM_LIMIT)) continue;
    s.options.push({ command: r.item, positions: r.positions, domId: '' });
  }
  const order = (s: string) => (SECTION_ORDER.includes(s) ? SECTION_ORDER.indexOf(s) : SECTION_ORDER.length);
  const out = [...bySection.entries()]
    .sort(([a, x], [b, y]) => (q.trim() ? y.best - x.best : 0) || order(a) - order(b))
    .map(([section, s]) => ({ section, options: s.options }));
  let n = 0;
  for (const g of out) for (const o of g.options) o.domId = `${listId}-o${n++}`;
  return out;
});

const options = computed(() => groups.value.flatMap((g) => g.options));
const activeOption = computed(() => options.value[active.value]);
watch(query, () => {
  active.value = 0;
  message.value = null;
});
watch(options, (o) => {
  if (active.value >= o.length) active.value = Math.max(0, o.length - 1);
});
watch(activeOption, (o) => {
  if (o) nextTick(() => document.getElementById(o.domId)?.scrollIntoView({ block: 'nearest' }));
});

const status = computed(() => {
  if (message.value) return message.value;
  const items = itemQuery.value.length >= 2 ? itemState.value : 'idle';
  const n = options.value.length;
  const count = query.value.trim() ? `${n} ${n === 1 ? 'result' : 'results'}` : '';
  if (items === 'loading') return [count, 'loading the item index…'].filter(Boolean).join(' · ');
  if (items === 'unavailable')
    return [count, 'item search needs the game data, which is not available'].join(' · ');
  if (query.value.trim() && !n) return 'No matches. Try a page, an action, an item, a spec or a run number.';
  return count;
});

/** The label split into plain and matched runs, for highlighting. */
function segments(label: string, positions: number[]): { text: string; hit: boolean }[] {
  const hits = new Set(positions);
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < label.length; i++) {
    const hit = hits.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += label[i];
    else out.push({ text: label[i]!, hit });
  }
  return out;
}

// ---------------------------------------------------------------- running and keys

async function choose(o: Option | undefined) {
  const c = o?.command;
  if (!c) return;
  if (c.disabled) {
    message.value = `${c.label}: ${c.disabled}`;
    return;
  }
  if (!c.feedback) palette.hide();
  try {
    const text = await c.run();
    if (!c.feedback) return;
    if (typeof text === 'string' && text) {
      message.value = text;
      setTimeout(() => palette.hide(), 900);
    } else palette.hide();
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (c.feedback) message.value = `${c.label} failed: ${why}`;
    else console.warn(`command ${c.id} failed:`, why);
  }
}

function move(delta: number) {
  const n = options.value.length;
  if (n) active.value = (active.value + delta + n) % n;
}

function onKey(e: KeyboardEvent) {
  e.stopPropagation(); // the page's own shortcuts (Esc in the item picker, ⌘↵ on the sim bar) stay out of it
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) move(1);
  else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) move(-1);
  else if (e.key === 'PageDown') move(5);
  else if (e.key === 'PageUp') move(-5);
  else if (e.key === 'Enter' && !e.isComposing) void choose(activeOption.value);
  else if (e.key === 'Escape') palette.hide();
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') palette.hide();
  else if (e.key === 'Tab') {
    /* focus stays in the input: it is the dialog's only control */
  } else return;
  e.preventDefault();
}

// Focus trap: anything that takes focus outside the dialog hands it back to the input.
function onFocusIn(e: FocusEvent) {
  if (dialog.value && !dialog.value.contains(e.target as Node)) input.value?.focus();
}
onMounted(() => {
  input.value?.focus();
  document.addEventListener('focusin', onFocusIn);
});
onBeforeUnmount(() => document.removeEventListener('focusin', onFocusIn));
</script>

<template>
  <div class="scrim" @mousedown.self="palette.hide()">
    <div
      ref="dialog"
      class="palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      @keydown="onKey"
    >
      <div class="field">
        <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.3" />
          <path d="M7.8 7.8L11 11" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <input
          ref="input"
          v-model="query"
          type="text"
          role="combobox"
          aria-label="Search pages, actions, items, specs and runs"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="activeOption?.domId"
          :aria-describedby="`${listId}-help`"
          placeholder="Search pages, actions, items, specs, runs"
          autocomplete="off"
          spellcheck="false"
        />
        <UiKbd keys="esc" />
      </div>

      <div :id="listId" class="list" role="listbox" aria-label="Results">
        <div
          v-for="g in groups"
          :key="g.section"
          class="group"
          role="group"
          :aria-labelledby="`${listId}-${g.section.replace(/\W+/g, '-')}`"
        >
          <div
            :id="`${listId}-${g.section.replace(/\W+/g, '-')}`"
            class="label group__label"
            role="presentation"
          >
            {{ g.section }}
          </div>
          <div
            v-for="o in g.options"
            :id="o.domId"
            :key="o.command.id"
            class="opt"
            role="option"
            :aria-selected="o === activeOption"
            :aria-disabled="o.command.disabled ? 'true' : undefined"
            :class="{ 'is-active': o === activeOption, 'is-disabled': !!o.command.disabled }"
            @mousemove="active = options.indexOf(o)"
            @click="choose(o)"
          >
            <span class="opt__label"
              ><template v-for="(s, i) in segments(o.command.label, o.positions)" :key="i"
                ><mark v-if="s.hit">{{ s.text }}</mark
                ><template v-else>{{ s.text }}</template></template
              ></span
            >
            <span v-if="o.command.disabled || o.command.detail" class="opt__detail">{{
              o.command.disabled || o.command.detail
            }}</span>
            <UiKbd v-if="o.command.kbd" :keys="o.command.kbd" />
          </div>
        </div>
      </div>

      <div class="foot">
        <span class="foot__status" role="status">{{ status }}</span>
        <span :id="`${listId}-help`" class="foot__keys"
          ><UiKbd keys="↑↓" /> move <UiKbd keys="↵" /> choose <UiKbd keys="esc" /> close</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh var(--space-5) var(--space-5);
  background: rgb(8 9 10 / 62%);
}
.palette {
  width: min(640px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-tooltip);
  box-shadow: var(--shadow-tooltip);
  overflow: hidden;
}
.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  height: 44px;
  border-bottom: 1px solid var(--line-seam);
  color: var(--text-3);
}
.field input {
  flex-grow: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-1);
  font-size: var(--text-md);
}
.field input::placeholder {
  color: var(--text-3);
}
.list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 420px;
  overflow-y: auto;
  padding: var(--space-1) 0;
}
.group + .group {
  border-top: 1px solid var(--line-row);
}
.group__label {
  padding: var(--space-2) var(--space-4) var(--space-1);
}
.opt {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: 6px var(--space-4);
  cursor: pointer;
}
.opt.is-active {
  background: var(--bg-raised);
  box-shadow: inset 2px 0 0 var(--series-1);
}
.opt.is-disabled {
  cursor: default;
}
.opt.is-disabled .opt__label {
  color: var(--text-2);
}
.opt__label {
  flex-shrink: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.opt__label mark {
  background: transparent;
  color: var(--delta-up);
}
.opt__detail {
  flex-grow: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--control-md);
  padding: 4px var(--space-4);
  border-top: 1px solid var(--line-seam);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.foot__status {
  flex-grow: 1;
  min-width: 0;
}
.foot__keys {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
@media (max-width: 640px) {
  .scrim {
    padding-top: var(--space-5);
  }
  .foot__keys {
    display: none;
  }
}
</style>
