<script setup lang="ts">
// The run in plain words, above the detailed panels: DPS with its ±, the fight, how many fights were simmed, the
// top three abilities by share, and what changed since the previous run of the same character (by name and class)
// in this browser's history. A "What am I looking at?" disclosure explains the terms the panels below use.
import type { Summary } from '@fsim/analysis';
import { fightLabel } from '@fsim/gamedata';
import type { RunEntry } from '~/composables/session';

const props = defineProps<{
  entry: RunEntry;
  summary: Summary;
  /** The run page's ability rows (`useRunAnalysis().abilities`), sorted by DPS. */
  abilities: readonly { name: string; share: number }[];
}>();

const session = useSession();
const names = useActionNames();

const record = computed(() => props.entry.record);
const char = computed(() => record.value.character);
const who = computed(() => char.value.name || 'this character');

const top = computed(() =>
  [...props.abilities]
    .sort((a, b) => b.share - a.share)
    .slice(0, 3)
    .map((r) => `${r.name} ${formatPercent(r.share, 0)}`),
);

/** The newest earlier run of the same character (same name and class), if this browser has one. */
const previous = computed<RunEntry | null>(() => {
  const r = record.value;
  let best: RunEntry | null = null;
  for (const e of session.runs.value) {
    const c = e.record.character;
    if (e.record.id === r.id || e.record.createdAt >= r.createdAt) continue;
    if (c.name !== r.character.name || c.class !== r.character.class) continue;
    if (!best || e.record.createdAt > best.record.createdAt) best = e as RunEntry;
  }
  return best;
});

const sincePrevious = computed(() => {
  const p = previous.value;
  if (!p) return null;
  const delta = record.value.summary.dpsMean - p.record.summary.dpsMean;
  // Both runs' 95% half-widths combined: a difference below this is within the runs' noise.
  const noise = Math.hypot(record.value.summary.dpsCi95, p.record.summary.dpsCi95);
  const groups = diffCharacters(p.record.character, char.value, diffNames(names.db.value, null));
  return {
    id: p.record.id,
    delta,
    pct: p.record.summary.dpsMean ? delta / Math.abs(p.record.summary.dpsMean) : null,
    real: Math.abs(delta) > noise,
    changed: groups.length ? changeSummary(groups, (s) => SLOT_LABELS[s]) : null,
  };
});

const CI_TIP =
  'The 95% confidence interval of the mean: rerunning with other random rolls lands within this range 95 times in 100. More iterations make it narrower.';
</script>

<template>
  <UiPanel title="Summary" :span="12" padded>
    <div class="summary" data-testid="run-summary">
      <p class="lead">
        <strong class="num dps">{{ formatNumber(summary.mean, 1) }} DPS</strong>
        <UiTooltip :text="CI_TIP">
          <template #default="{ describedby }">
            <span class="num ci" tabindex="0" :aria-describedby="describedby"
              >± {{ formatNumber(summary.ci95, 1) }}</span
            >
          </template>
        </UiTooltip>
        <span>
          on {{ fightLabel(char.encounter) }}, averaged over {{ formatNumber(summary.n, 0) }} simulated
          fights.</span
        >
      </p>
      <p v-if="top.length" class="line">
        <span class="label">Most damage</span>
        <span>{{ top.join(' · ') }}</span>
      </p>
      <p class="line">
        <span class="label">Since last run</span>
        <span v-if="sincePrevious">
          <span class="num">{{ formatSigned(sincePrevious.delta, 1) }} DPS</span>
          <span v-if="sincePrevious.pct !== null" class="num">
            ({{ formatSigned(sincePrevious.pct * 100, 1) }}%)</span
          >
          vs run {{ sincePrevious.id }},
          {{ sincePrevious.real ? 'more than the runs’ noise' : 'within the runs’ noise' }}.
          {{ sincePrevious.changed ? `Changed: ${sincePrevious.changed}.` : 'Same character settings.' }}
        </span>
        <span v-else class="text-3">This is the first run of {{ who }} in this browser.</span>
      </p>

      <details class="help">
        <summary>What am I looking at?</summary>
        <dl>
          <dt>± and 95% CI</dt>
          <dd>
            How far the mean could move with other random rolls. Two runs whose difference is inside it are
            effectively the same.
          </dd>
          <dt>σ and CV</dt>
          <dd>
            σ (standard deviation) is how much one fight's DPS varies from the next; CV is σ as a share of the
            mean.
          </dd>
          <dt>Distribution</dt>
          <dd>How many simulated fights ended at each DPS: the spread you would see fight to fight.</dd>
          <dt>Convergence</dt>
          <dd>The running mean as iterations are added; once it flattens, more iterations change little.</dd>
          <dt>Timeline and lanes</dt>
          <dd>
            One sample fight: DPS over time, and a lane (row) per buff or cooldown showing when it was active.
          </dd>
          <dt>Share</dt>
          <dd>An ability's part of all damage done, over every simulated fight.</dd>
        </dl>
      </details>
    </div>
  </UiPanel>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-md);
  color: var(--text-1);
}
.lead {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-2);
  margin: 0;
}
.dps {
  font-size: var(--text-lg);
  font-weight: 500;
}
.ci {
  color: var(--text-2);
  border-bottom: 1px dotted var(--text-3);
  cursor: help;
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-3);
  margin: 0;
}
.line > .label {
  min-width: 108px;
}
.text-3 {
  color: var(--text-3);
}
.help summary {
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--text-2);
}
.help dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
}
.help dt {
  color: var(--text-1);
  font-weight: 500;
}
.help dd {
  margin: 0;
  color: var(--text-2);
}
@media (max-width: 640px) {
  .help dl {
    grid-template-columns: minmax(0, 1fr);
  }
  .help dd {
    margin-bottom: var(--space-1);
  }
}
</style>
