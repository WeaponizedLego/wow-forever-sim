<script setup lang="ts">
// What the engine says the draft's rotation will not do, under the rotation's settings. The engine notes it
// when it sets the rotation up against the character (computeStats), per step and in its own words; a sim
// only shows the result as lower DPS. The notes are named and sorted by @fsim/gamedata `rotationCheck`.
//
// The Workbench already asks for that sheet (the caps panel needs the attack table), and `characterSheet`
// keeps one answer per character, so asking here costs no second engine call.
import type { Character } from '@fsim/contracts';
import { nameList, rotationCheck, rotationMessages } from '@fsim/gamedata';
import type { APLStats } from '@fsim/proto/api';

const wb = useWorkbench();
const engine = useEngine();
const names = useActionNames();
const id = useId();

// The engine's answer and the draft it is for. Only the answer for the draft on screen is shown: while the
// engine works on an edit, or cannot answer, the notes of the rotation before it would be wrong.
const answer = shallowRef<{ of: Character; stats: APLStats | undefined } | null>(null);
const failed = shallowRef<Character | null>(null);
watch(
  () => wb.draft.value,
  async (c) => {
    if (!c) return;
    try {
      const sheet = await characterSheet(c, true);
      // An older draft's answer can arrive after a newer one's.
      if (wb.draft.value === c) answer.value = { of: c, stats: sheet.rotationStats };
    } catch {
      if (wb.draft.value === c) failed.value = c;
    }
  },
  { immediate: true },
);

const check = computed(() => {
  const a = answer.value;
  // Names need the game data; without it every spell would read "Spell 27801".
  if (a?.of !== wb.draft.value || !a.stats || !names.db.value) return null;
  return rotationCheck(rotationMessages(a.stats), names.sources.value);
});
/** The engine will not answer for this draft: the call failed, or it answered without setting the rotation up. */
const noAnswer = computed(() => {
  const c = wb.draft.value;
  return failed.value === c || (answer.value?.of === c && !answer.value.stats);
});
/** What to say while there is no check to show. */
const waiting = computed(() => {
  if (check.value) return null;
  if (!noAnswer.value) return 'Checking in the engine…';
  return engine.status.value === 'unavailable' || engine.status.value === 'error'
    ? 'The engine is not available, so this rotation is not checked.'
    : 'The engine could not set this rotation up for this character, so there is no check.';
});

interface Row {
  kind: string;
  label: string;
  /** Whole sentences, one per line. */
  sentences?: string[];
  /** Names, shown as one phrase that folds when long. */
  names?: string[];
  hint?: string;
  warning?: boolean;
}
const rows = computed<Row[]>(() => {
  const c = check.value;
  if (!c) return [];
  const all: Row[] = [
    { kind: 'never-cast', label: 'Never cast', sentences: c.neverCast, warning: true },
    {
      kind: 'missing',
      label: 'Does not have',
      names: c.missing,
      hint: 'The rotation goes without these. Upstream writes one rotation for every build of a class, so talents this build did not take are expected here.',
    },
    {
      kind: 'effects',
      label: 'Never active',
      names: c.effects,
      hint: 'Buffs and debuffs the rotation checks for and never finds.',
    },
    { kind: 'setup', label: 'Not set up', sentences: c.setup },
    {
      kind: 'autocast',
      label: 'Casts on its own',
      names: c.autocast,
      hint: 'Cooldowns it uses as they come up, without a step of their own. Not a problem.',
    },
  ];
  return all.filter((r) => r.sentences?.length || r.names?.length);
});
const otherCount = computed(() => check.value?.other.reduce((n, o) => n + o.count, 0) ?? 0);

/** Names shown before a list folds ("… and 9 more"). */
const MAX_NAMES = 6;
const open = ref<string[]>([]);
const isOpen = (kind: string) => open.value.includes(kind);
function toggle(kind: string) {
  open.value = isOpen(kind) ? open.value.filter((k) => k !== kind) : [...open.value, kind];
}
</script>

<template>
  <section class="check" :aria-labelledby="id" :aria-busy="!check && !noAnswer" data-testid="rotation-check">
    <div class="check__head">
      <h3 :id="id" class="check__title">Rotation check</h3>
      <p class="check__what">What the engine says this rotation will not do for this character.</p>
    </div>
    <p v-if="waiting" class="check__note">{{ waiting }}</p>
    <p v-else-if="check && !check.total" class="check__note">
      <UiStatusGlyph status="good" hide-label />The engine has nothing to report.
    </p>
    <template v-else-if="check">
      <dl v-if="rows.length" class="check__rows">
        <div v-for="r in rows" :key="r.kind" class="check__row" :data-kind="r.kind">
          <dt class="check__label">
            <UiStatusGlyph v-if="r.warning" status="warning" hide-label />{{ r.label
            }}<span v-if="r.names" class="num check__count">{{ r.names.length }}</span>
          </dt>
          <dd class="check__body">
            <p v-for="s in r.sentences" :key="s" class="check__line">{{ s }}</p>
            <p v-if="r.names" class="check__line check__names">
              <span class="check__list">{{ nameList(r.names, isOpen(r.kind) ? Infinity : MAX_NAMES) }}</span>
              <UiButton
                v-if="r.names.length > MAX_NAMES + 1"
                size="sm"
                :aria-expanded="isOpen(r.kind)"
                @click="toggle(r.kind)"
                >{{ isOpen(r.kind) ? 'Show fewer' : `Show all ${r.names.length}` }}</UiButton
              >
            </p>
            <p v-if="r.hint" class="check__hint">{{ r.hint }}</p>
          </dd>
        </div>
      </dl>
      <details v-if="check.other.length" class="check__more">
        <summary class="num">
          {{ otherCount }} other {{ otherCount === 1 ? 'note' : 'notes' }} from the engine
        </summary>
        <ul class="check__notes">
          <li v-for="o in check.other" :key="o.text">
            {{ o.text }}
            <span v-if="o.count > 1" class="num check__times">{{ o.count }} times</span>
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
/* Same block as the settings above it: its padding, its row line, its muted title. */
.check {
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--line-row);
  font-size: var(--text-sm);
}
.check__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 var(--space-3);
  min-height: 24px;
}
.check__title,
.check__what {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--text-3);
}
.check__title {
  color: var(--text-2);
}
.check__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: var(--space-1) 0 0;
  color: var(--text-2);
}
.check__rows {
  margin: var(--space-2) 0 0;
}
.check__row {
  display: grid;
  grid-template-columns: 10.5em minmax(0, 1fr);
  gap: 0 var(--space-3);
  padding: var(--space-1) 0;
}
.check__label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-3);
}
.check__label :deep(.glyph) {
  transform: translateY(2px);
}
.check__count {
  color: var(--text-2);
}
.check__body {
  margin: 0;
  min-width: 0;
  color: var(--text-2);
}
.check__line {
  margin: 0;
}
.check__row[data-kind='never-cast'] .check__line {
  color: var(--text-1);
}
/* The fold button sits in the text, a line high. A space and not a margin sets it off, so it starts flush
   when it wraps to a line of its own. */
.check__list::after {
  content: ' ';
}
.check__names :deep(.btn) {
  height: 1.5rem;
  padding: 0 var(--space-2);
  vertical-align: top;
}
.check__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.check__more {
  margin-top: var(--space-1);
}
.check__more summary {
  width: fit-content;
  font-size: var(--text-xs);
  color: var(--text-3);
  cursor: pointer;
}
.check__notes {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
  color: var(--text-2);
}
.check__notes li {
  padding: var(--space-1) 0;
}
.check__times {
  color: var(--text-3);
}
@media (max-width: 640px) {
  .check__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
