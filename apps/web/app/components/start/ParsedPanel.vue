<script setup lang="ts">
import type { ImportResult } from '@fsim/contracts';
import { fillFromPreset, findRotation, loadSpecPresets, type SpecPresets } from '@fsim/gamedata';
import { parseWowheadLink } from '@fsim/importers';

// Parse report: who was read, how much of the gear mapped, every diagnostic with its code and line,
// and the two ways on: open in the workbench, or sim as is.
const props = defineProps<{
  span: number;
  input: string;
  result: ImportResult | null;
  parsing: boolean;
  parseError: string | null;
}>();

const session = useSession();
const engine = useEngine();

const character = computed(() => props.result?.character ?? null);
// "Wowhead planner link · WoW Forever": which planner a link came from matters (Classic Era, TBC… read with notes).
const PLANNERS: Record<string, string> = {
  forever: 'WoW Forever',
  classic: 'Classic Era',
  tbc: 'TBC Classic',
  wotlk: 'Wrath Classic',
  cata: 'Cataclysm Classic',
  'mop-classic': 'MoP Classic',
  retail: 'retail',
};
const formatLabel = computed(() => {
  const r = props.result;
  if (!r) return '';
  if (r.format !== 'wowhead-url') return startFormatLabel(props.input, r);
  const game = parseWowheadLink(props.input)?.game;
  return game ? `Wowhead planner link · ${PLANNERS[game] ?? game}` : 'Wowhead link, not the gear planner';
});
// What the sim will run with once the preset has filled what the export lacks (as useSession().setCharacter does):
// above all the rotation, which no export carries and which is picked from the talents.
const presets = shallowRef<SpecPresets | null>(null);
watch(
  () => character.value?.spec,
  async (spec) => {
    presets.value = null;
    if (!spec) return;
    const loaded = await loadSpecPresets(spec);
    if (character.value?.spec === spec) presets.value = loaded;
  },
  { immediate: true },
);
const filled = computed(() => {
  const c = character.value;
  const p = presets.value;
  return c && p?.specId === c.spec ? fillFromPreset(c, p) : null;
});
const rotationName = computed(() => {
  const r = filled.value?.rotation;
  return r?.kind === 'preset' ? (findRotation(presets.value!, r.presetId)?.name ?? null) : null;
});
// Warnings first; lines set aside because the engine does not use them fold into one closed row.
const report = computed(() => {
  if (!props.result) return null;
  const d = props.result.diagnostics;
  return parseReport(filled.value ? withRotationPick(d, filled.value, presets.value!) : d);
});
const unusedGroup = computed(() =>
  report.value?.unused.length
    ? {
        summary: unusedSummary(report.value.unused.length),
        status: 'good' as const,
        items: report.value.unused,
      }
    : null,
);

const identity = computed(() => {
  const c = character.value;
  if (!c) return null;
  const where = [c.region?.toUpperCase(), c.realm].filter(Boolean).join(' ');
  const talentsFromPreset = props.result!.diagnostics.some(
    (d) => d.code === 'DEFAULT-05' && d.field === 'talents',
  );
  return {
    name: c.name || 'Unnamed character',
    line: [`${startRaceName(c.race)} ${startSpecName(c.spec)}`, `level ${c.level}`, where]
      .filter(Boolean)
      .join(' · '),
    slots: `${Object.keys(c.gear).length}/${START_SLOT_COUNT}`,
    talents: talentsFromPreset || !c.talents ? 'preset' : (startTalentPoints(c.talents) ?? 'export'),
  };
});

const busy = ref<'open' | 'sim' | null>(null);
const actionError = ref<string | null>(null);
const engineDown = computed(() => engine.status.value === 'unavailable');

const blockedReason = computed(() => {
  if (props.input.trim() === '') return 'Paste an export to continue.';
  if (props.parsing && !props.result) return 'Reading the export…';
  if (props.parseError) return 'The export could not be read against the game data.';
  if (!character.value)
    return 'No character could be read, so there is nothing to open. See the notes above.';
  return null;
});
const simBlockedReason = computed(
  () =>
    blockedReason.value ?? (engineDown.value ? 'Simming needs the engine, which is not available.' : null),
);

async function open() {
  const c = character.value;
  if (!c || busy.value) return;
  busy.value = 'open';
  actionError.value = null;
  try {
    await session.setCharacter(c, props.result!.diagnostics);
    await navigateTo('/workbench');
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = null;
  }
}

// The same remembered iterations as the Workbench sim bar.
const simPrefs = useSimPrefs();

async function simAsIs() {
  const c = character.value;
  if (!c || busy.value) return;
  busy.value = 'sim';
  actionError.value = null;
  try {
    await session.setCharacter(c, props.result!.diagnostics);
    const run = await session.runSim({ iterations: simPrefs.iterations.value });
    await navigateTo(`/runs/${run.record.id.replace(/^#/, '')}`);
  } catch (e) {
    actionError.value = session.lastError.value ?? (e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = null;
  }
}

const progress = computed(() => {
  const p = session.progress.value;
  if (busy.value !== 'sim') return null;
  if (!p) return { label: 'Loading engine', value: undefined, detail: undefined };
  return {
    label: 'Simming',
    value: p.fraction ?? undefined,
    detail: `${formatNumber(p.completed, 0)} / ${formatNumber(p.total, 0)} it`,
  };
});
</script>

<template>
  <UiPanel title="Parsed" :meta="formatLabel || undefined" :span="span">
    <UiEmptyState
      v-if="!input.trim()"
      title="Nothing pasted yet"
      body="The report lists what was read, what was filled from the spec preset and what was skipped, line by line."
    />
    <p v-else-if="parsing && !result && !parseError" class="pad text-2">Reading the export…</p>
    <UiCheckList
      v-else-if="parseError"
      dense
      :items="[
        {
          status: 'warning',
          text: `Game data is not available, so the export cannot be checked: ${parseError}`,
        },
      ]"
    />
    <template v-else-if="result">
      <div v-if="identity && character" class="ident">
        <UiClassMarker :cls="character.class" size="lg" />
        <div class="ident__who">
          <div class="ident__name">{{ identity.name }}</div>
          <div class="ident__line">{{ identity.line }}</div>
        </div>
        <UiKeyValueStrip
          align="end"
          :items="[
            { label: 'Slots', value: identity.slots },
            { label: 'Talents', value: identity.talents },
            ...(rotationName ? [{ label: 'Rotation', value: rotationName }] : []),
          ]"
        />
      </div>
      <div class="checks">
        <UiCheckList dense :items="report?.items ?? []" :collapsed="unusedGroup" />
      </div>
    </template>

    <template #footer>
      <div class="actions">
        <div v-if="progress" class="actions__progress">
          <UiProgressBar :label="progress.label" :value="progress.value" :detail="progress.detail" />
        </div>
        <div class="actions__row">
          <UiSegmentedControl
            v-model="simPrefs.preset.value"
            label="Iterations"
            hide-label
            size="sm"
            :options="ITERATION_OPTIONS"
          />
          <UiButton :disabled="!!simBlockedReason || !!busy" @click="simAsIs">{{
            busy === 'sim' ? 'Simming…' : 'Sim as-is'
          }}</UiButton>
          <UiButton variant="primary" :disabled="!!blockedReason || !!busy" @click="open">{{
            busy === 'open' ? 'Opening…' : 'Open in workbench'
          }}</UiButton>
          <span v-if="actionError" class="actions__why">
            <UiStatusGlyph status="warning" hide-label label="Failed" /> <UiErrorText :text="actionError" />
          </span>
          <span v-else-if="simBlockedReason" class="actions__why">{{ simBlockedReason }}</span>
          <span v-else class="actions__why"
            >Sim as-is runs {{ formatNumber(simPrefs.iterations.value, 0) }} iterations with the preset buffs
            and fight.</span
          >
        </div>
      </div>
    </template>
  </UiPanel>
</template>

<style scoped>
.pad {
  margin: 0;
  padding: var(--space-3) var(--space-4);
}
.text-2 {
  color: var(--text-2);
}
.ident {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--line-row);
}
.ident__who {
  flex-grow: 1;
  min-width: 0;
}
.ident__name {
  font-weight: 500;
}
.ident__line {
  font-size: var(--text-sm);
  color: var(--text-2);
}
.checks {
  max-height: 300px;
  overflow: auto;
}
.actions {
  padding: 10px var(--space-4) var(--space-4);
  border-top: 1px solid var(--line-row);
}
.actions__progress {
  margin-bottom: 10px;
}
.actions__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.actions__why {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
</style>
