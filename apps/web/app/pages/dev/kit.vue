<script setup lang="ts">
// /dev/kit: every UI primitive and chart with the v2 mockups' sample data, laid out like the
// mockups (Analysis, Workbench, Top gear, Start) so the two can be compared side by side, then a
// sheet of primitive variants and states.
import type { NavItem, RowState, TableColumn, TableSort } from '~/composables/ui-types';
import * as K from './-kit-data';

useHead({ title: 'UI kit · forever/sim' });

const nav: NavItem[] = [
  { label: 'Runs', to: '/dev/kit#analysis' },
  { label: 'Workbench', to: '/dev/kit#workbench' },
  { label: 'Top gear', to: '/dev/kit#top-gear' },
  { label: 'Start', to: '/dev/kit#start' },
  { label: 'Primitives', to: '/dev/kit#primitives' },
];
const query = ref('');
const tables = ref(false);
const distView = ref('chart');

// ---------------------------------------------------------------- Analysis
type Ability = (typeof K.abilities)[number];
const abilityCols: TableColumn<Ability>[] = [
  { key: 'name', label: 'Ability', sortable: true },
  { key: 'dps', label: 'DPS', numeric: true, sortable: true },
  { key: 'err', label: '±', srLabel: '95% CI (±)', numeric: true, tone: '3' },
  { key: 'share', label: 'Share', width: '18%', sortable: true },
  { key: 'cpm', label: 'CPM', numeric: true, tone: '2', sortable: true, sortValue: (r) => r.cpm ?? -1 },
  { key: 'avg', label: 'Avg', numeric: true, tone: '2', sortable: true },
  { key: 'out', label: 'Outcomes', width: '26%' },
];
const abilitySort = ref<TableSort | null>({ key: 'dps', dir: 'desc' });
const OUTCOME_LEGEND = [
  { label: 'Hit', mark: 'swatch', color: 'var(--series-1)' },
  { label: 'Crit', mark: 'swatch', color: 'var(--series-2)' },
  { label: 'Glance', mark: 'swatch', color: 'var(--series-3)' },
  { label: 'Miss / dodge', mark: 'swatch', color: 'var(--series-muted)' },
] as const;

type Weight = (typeof K.weights)[number];
const weightCols: TableColumn<Weight>[] = [
  { key: 'stat', label: 'Stat' },
  { key: 'value', label: 'Weight', numeric: true },
  { key: 'ci', label: '±', srLabel: '95% CI (±)', numeric: true, tone: '3' },
  { key: 'whisker', label: 'CI as % of weight', width: '34%' },
];
const fmtWeight = (v: number) => v.toFixed(2);

// ---------------------------------------------------------------- Workbench
type Gear = K.GearRow;
const gearCols: TableColumn<Gear>[] = [
  { key: 'slot', label: 'Slot', tone: '3', width: '78px' },
  { key: 'name', label: 'Item' },
  { key: 'ilvl', label: 'ilvl', numeric: true, tone: '2' },
  { key: 'source', label: 'Source', tone: '2' },
  { key: 'enchant', label: 'Enchant' },
  { key: 'value', label: 'Value', width: '20%' },
];
const gearState = (r: Gear): RowState | undefined =>
  r.missing ? 'warning' : r.was || r.enchantNew ? 'changed' : undefined;
const VALUE_MAX = 142;
const benchTab = '/dev/kit#workbench';
const benchTabs: NavItem[] = [
  { label: 'Gear', to: benchTab },
  { label: 'Talents', to: '/dev/kit#talents', detail: '30/21/0' },
  { label: 'Buffs', to: '/dev/kit#buffs', detail: '14' },
  { label: 'Fight', to: '/dev/kit#fight' },
  { label: 'Rotation', to: '/dev/kit#rotation' },
];
const pending = [
  [
    { op: '-', label: 'Wristguards of Stability', detail: 'wrist' },
    { op: '+', label: 'Bracers of Might', detail: '+6.8 ±1.4', detailTone: 'up' },
  ],
  [
    { op: '-', label: 'Chest: +4 All Stats', detail: 'enchant' },
    { op: '+', label: 'Chest: Greater Stats', detail: '+2.1 ±0.3', detailTone: 'up' },
  ],
] as const;
type Stat = (typeof K.stats)[number];
const statCols: TableColumn<Stat>[] = [
  { key: 'stat', label: 'Stat', tone: '2' },
  { key: 'run', label: 'Run', numeric: true, tone: '3' },
  { key: 'draft', label: 'Draft', numeric: true },
  { key: 'delta', label: 'Δ', srLabel: 'Change', numeric: true },
];
const iterations = ref('5k');
const withWeights = ref(true);
const withScaling = ref(false);

// ---------------------------------------------------------------- Top gear
type Rank = (typeof K.ranking)[number];
const slotFilters = reactive({ wrist: true, ring: true, ranged: true });
const hideNoise = ref(false);
const rankingRows = computed(() =>
  K.ranking.filter((r) => !hideNoise.value || r.equipped || Math.abs(r.delta) >= K.COMPARE.noise),
);
const rankCols: TableColumn<Rank>[] = [
  { key: 'rank', label: '#', numeric: true, tone: '3', width: '28px' },
  { key: 'changes', label: 'Changes from equipped' },
  { key: 'mean', label: 'Mean', numeric: true, sortable: true },
  { key: 'delta', label: 'Δ', srLabel: 'Change vs equipped', numeric: true },
  { key: 'forest', label: 'Mean and 95% CI', width: '34%' },
  { key: 'verdict', label: 'Verdict' },
];
const rankSort = ref<TableSort | null>(null);
const FOREST_DOMAIN: [number, number] = [K.COMPARE.lo, K.COMPARE.hi];
const verdictOf = (r: Rank) =>
  r.equipped ? 'reference' : Math.abs(r.delta) < K.COMPARE.noise ? 'noise' : r.delta > 0 ? 'up' : 'down';
type Best = (typeof K.bestPerSlot)[number];
const bestCols: TableColumn<Best>[] = [
  { key: 'slot', label: 'Slot', tone: '2' },
  { key: 'item', label: 'Best item' },
  { key: 'gain', label: 'Gain alone', numeric: true },
];

// ---------------------------------------------------------------- Start
const paste = ref(K.pasted);
type Recent = (typeof K.recentRuns)[number];
const recentCols: TableColumn<Recent>[] = [
  { key: 'id', label: 'Run', tone: '3', sortable: true },
  { key: 'who', label: 'Character', sortable: true },
  { key: 'dps', label: 'DPS', numeric: true, sortable: true },
  { key: 'engine', label: 'Engine' },
  { key: 'when', label: 'When', align: 'right', tone: '3' },
];
const recentSort = ref<TableSort | null>(null);
const selectedRun = ref('#0412');

// ---------------------------------------------------------------- Primitives
const seg = ref('chart');
const chipA = ref(true);
const chipB = ref(false);
const check = ref(true);
const name = ref('Kargath');
const seed = ref('0x5F1');
const search = ref('');
</script>

<template>
  <div class="kit">
    <UiAppChrome
      v-model:query="query"
      :nav="nav"
      current="/dev/kit#analysis"
      home="/"
      :status="{ tone: 'good', text: 'build 70862 · synced 2h ago' }"
      search
    />

    <main class="page">
      <div class="intro">
        <div>
          <h1 class="intro__title">UI kit</h1>
          <p class="intro__text">
            Primitives from <code class="num">components/ui</code> and charts from
            <code class="num">components/charts</code>, with the sample data of the v2 mockups. Each section
            matches one mockup screen.
          </p>
        </div>
        <UiCheckbox v-model="tables">Show chart tables</UiCheckbox>
      </div>

      <!-- ============================================================ Analysis -->
      <section id="analysis" class="kit-section" aria-labelledby="k-analysis">
        <p id="k-analysis" class="label kit-h">01 · Analysis <span class="num">Analysis.dc.html</span></p>
        <UiPageHeader
          title="Kargath"
          subtitle="· Fury Warrior"
          meta="run #0412 · baseline #0409 · 12 Nov 14:02"
          marker="warrior"
          :level="2"
          :items="[
            { label: 'Iterations', value: '5,000' },
            { label: 'Fight', value: '180s ±20% · 1 tgt' },
            { label: 'Seed', value: '0x5F1A' },
            { label: 'Engine', value: 'v0.0.99 @ b2047bf' },
            { label: 'Wall', value: '4.2s · 8 workers' },
          ]"
        >
          <template #actions>
            <UiButton>Export JSON</UiButton>
            <UiButton>Share</UiButton>
            <UiButton>Add variant</UiButton>
            <UiButton variant="primary">Re-run</UiButton>
          </template>
        </UiPageHeader>

        <UiPanelGrid>
          <UiKpiTile
            label="Mean DPS · 95% CI"
            value="1,184.2"
            secondary="± 3.1"
            foot="1,181.1 – 1,187.3"
            :span="3"
          />
          <UiKpiTile label="Δ vs baseline #0409" value="+22.4" secondary="+1.9%" tone="up" :span="3">
            <template #foot>
              <UiStatusGlyph status="good" label="Significant" class="text-2" />
              <span class="text-2">· Welch t = 10.0, p &lt; 0.001</span>
            </template>
          </UiKpiTile>
          <UiKpiTile label="Spread (σ)" value="112.4" foot="CV 9.5%" size="md" :span="2">
            <template #label>Spread (<span class="lc">σ</span>)</template>
          </UiKpiTile>
          <UiKpiTile label="p5 – p95" value="999 – 1,369" foot="median 1,181.7" size="md" :span="2" />
          <UiKpiTile label="Precision" value="±0.26%" size="md" :span="2">
            <template #foot>stable after 2,800 it</template>
          </UiKpiTile>

          <UiPanel title="DPS distribution" :span="8">
            <template #meta>
              <ChartsLegend
                :items="[
                  { label: 'Run #0412', mark: 'swatch', color: 'var(--series-1)' },
                  { label: 'Baseline #0409', mark: 'dashed', color: 'var(--series-baseline)' },
                ]"
              >
                bin 15.5 DPS · n = 5,000
              </ChartsLegend>
            </template>
            <div class="view-toggle">
              <UiSegmentedControl
                v-model="distView"
                label="View"
                hide-label
                size="sm"
                :options="[
                  { value: 'chart', label: 'Chart' },
                  { value: 'table', label: 'Table' },
                ]"
              />
            </div>
            <ChartsHistogram
              v-bind="K.histogram"
              run-label="Run #0412"
              baseline-label="Baseline"
              label="Histogram of DPS across 5,000 iterations, roughly normal around 1,184, shifted right of the baseline run centred near 1,162."
              :show-table="tables || distView === 'table'"
            />
          </UiPanel>

          <UiPanel title="Convergence" meta="running mean ± 95% CI" :span="4">
            <ChartsLineBand
              :points="K.convergence"
              x-scale="log"
              :x-domain="[50, 5000]"
              :y-domain="[1150, 1220]"
              :y-ticks="[1150, 1185, 1220]"
              :x-ticks="[
                { value: 50, label: '50' },
                { value: 500, label: '500' },
                { value: 5000, label: '5,000 it' },
              ]"
              :marker="{ x: 2800, label: 'stable · 2,800' }"
              marker-align="left"
              :format-y="(v: number) => formatNumber(v, 0)"
              x-label="Iterations"
              y-label="Running mean"
              label="Running mean settles at 1,184 as the confidence band narrows from about ±30 at 50 iterations to ±3 at 5,000."
              :show-table="tables"
            />
          </UiPanel>

          <UiPanel title="Fight timeline" :span="12">
            <template #meta>
              <ChartsLegend
                :items="[
                  { label: 'Mean DPS, 5s buckets', mark: 'line', color: 'var(--series-1)' },
                  { label: '90% of iterations', mark: 'band', color: 'var(--series-1)' },
                ]"
              >
                <span class="text-2 sans">Lanes: share of iterations where the aura is active</span>
              </ChartsLegend>
            </template>
            <div class="timeline">
              <ChartsLineBand
                :points="K.timeline"
                :y-domain="[800, 1600]"
                :y-ticks="[800, 1200, 1600]"
                :height="160"
                :axis-width="136"
                :axis-gap="12"
                pad="0"
                :baseline="false"
                :region="{ from: 144, to: 180, label: 'execute phase · 20%' }"
                :reference="{ y: 1184.2, label: 'fight mean 1,184' }"
                :format-x="(v: number) => `${v}s`"
                :format-y="(v: number) => formatNumber(v, 0)"
                x-label="Time"
                y-label="Mean DPS"
                band-label="90% of iterations"
                label="Mean DPS starts near 1,480 while cooldowns run, settles near 1,100 from 40 seconds, and climbs to about 1,320 in the execute phase after 144 seconds."
                :show-table="tables"
              />
              <ChartsAuraLanes
                :lanes="K.lanes"
                :duration="180"
                :x-ticks="[0, 30, 60, 90, 120, 150, 180]"
                label="Aura uptime lanes over the 180 second fight."
                :show-table="tables"
              >
                <template #after>
                  <ChartsLineBand
                    :points="K.rage"
                    :y-domain="[0, 100]"
                    :height="48"
                    :axis-width="136"
                    :axis-gap="12"
                    pad="4px 0 0"
                    axis-title="Rage"
                    tone="muted"
                    :baseline="false"
                    :reference="{ y: 100 }"
                    :format-x="(v: number) => `${v}s`"
                    :format-y="(v: number) => formatNumber(v, 0)"
                    x-label="Time"
                    y-label="Rage"
                    label="Rage hovers between 20 and 70, touching the 100 cap briefly six times."
                    :show-table="tables"
                    class="rage"
                  />
                </template>
              </ChartsAuraLanes>
            </div>
          </UiPanel>

          <UiPanel title="Damage by ability" :span="8">
            <template #meta><ChartsLegend :items="[...OUTCOME_LEGEND]" /></template>
            <UiDataTable
              v-model:sort="abilitySort"
              :columns="abilityCols"
              :rows="K.abilities"
              :row-key="(r) => r.name"
              caption="Damage by ability"
              min-width="760px"
            >
              <template #cell-name="{ row }"
                ><span class="sans-md">{{ row.name }}</span></template
              >
              <template #cell-dps="{ row }">{{ formatNumber(row.dps, 1) }}</template>
              <template #cell-err="{ row }">{{ formatNumber(row.err, 1) }}</template>
              <template #cell-share="{ row }">
                <ChartsInlineBar
                  :value="row.share"
                  :max="26.4"
                  :text="`${formatNumber(row.share, 1)}%`"
                  text-width="38px"
                  class="text-2"
                />
              </template>
              <template #cell-cpm="{ row }">{{ row.cpm === null ? '—' : formatNumber(row.cpm, 1) }}</template>
              <template #cell-avg="{ row }">{{ formatNumber(row.avg, 0) }}</template>
              <template #cell-out="{ row }"
                ><ChartsStackedOutcomeBar :outcomes="row.outcomes" :name="row.name"
              /></template>
            </UiDataTable>
          </UiPanel>

          <UiPanelStack :span="4">
            <UiPanel title="Stat weights" meta="DPS per unit · 95% CI">
              <UiDataTable
                :columns="weightCols"
                :rows="K.weights"
                :row-key="(r) => r.stat"
                hide-header
                density="sm"
                caption="Stat weights"
              >
                <template #cell-stat="{ row }"
                  ><span class="sans-md">{{ row.stat }}</span>
                  <span class="unit">{{ row.unit }}</span></template
                >
                <template #cell-value="{ row }">{{ fmtWeight(row.value) }}</template>
                <template #cell-ci="{ row }">{{ row.ci ? `±${fmtWeight(row.ci)}` : 'ref' }}</template>
                <template #cell-whisker="{ row }">
                  <ChartsWhiskerDot
                    :rel="row.rel"
                    :max="25"
                    :label="row.stat"
                    :value-text="fmtWeight(row.value)"
                    :ci-text="row.ci ? `±${fmtWeight(row.ci)}` : undefined"
                  />
                </template>
              </UiDataTable>
              <div class="panel-foot">
                <span class="note">Whisker: CI as % of the weight</span>
                <UiButton size="sm">Copy Pawn</UiButton>
              </div>
            </UiPanel>
            <UiPanel title="Hit scaling" meta="9 points · 1,000 it each">
              <ChartsLineBand
                :points="K.hitScaling"
                :y-domain="[1020, 1240]"
                :y-ticks="[1020, 1130, 1240]"
                :x-ticks="[
                  { value: 4, label: '4%' },
                  { value: 6, label: '6%' },
                  { value: 8, label: '8%' },
                  { value: 10, label: '10%' },
                  { value: 12, label: '12% hit' },
                ]"
                :height="120"
                pad="14px 18px 8px 10px"
                :marker="{ x: 9, label: 'cap 9%' }"
                :highlight="K.hitYou"
                :format-x="(v: number) => `${v}%`"
                :format-y="(v: number) => formatNumber(v, 1)"
                x-label="Hit"
                y-label="DPS"
                label="DPS rises about 35 per 1% hit up to the 9% cap, then flattens to about 3 per 1%."
                :show-table="tables"
              />
            </UiPanel>
          </UiPanelStack>

          <UiPanel title="Run notes" :span="12">
            <template #meta><span class="sans">Rule-based checks on this run's metrics</span></template>
            <UiCheckList :items="K.notes" />
          </UiPanel>
        </UiPanelGrid>
      </section>

      <!-- ============================================================ Workbench -->
      <section id="workbench" class="kit-section" aria-labelledby="k-bench">
        <p id="k-bench" class="label kit-h">02 · Workbench <span class="num">Bench.dc.html</span></p>
        <UiPageHeader
          title="Kargath"
          subtitle="· Orc Fury Warrior · 60"
          meta="draft from run #0412 · 2 unsaved changes"
          marker="warrior"
          :level="2"
        >
          <UiTabNav label="Workbench" :items="benchTabs" :current="benchTab" />
          <UiKeyValueStrip
            :items="[
              { label: 'Avg ilvl', value: '66.2' },
              { label: 'Last run', value: '1,184.2' },
              { label: 'Draft est.', value: '1,193.1', tone: 'up' },
            ]"
          />
        </UiPageHeader>

        <UiPanelGrid>
          <UiPanel title="Equipped" :span="8" :row-span="3">
            <template #meta>
              <span class="sans"
                >Value = estimated DPS from this item's stats and procs, using run #0412 weights</span
              >
            </template>
            <UiDataTable
              :columns="gearCols"
              :rows="K.gear"
              :row-key="(r, i) => `${r.slot}-${i}`"
              :row-state="gearState"
              caption="Equipped gear"
              min-width="780px"
            >
              <template #cell-name="{ row }">
                <div v-if="row.was" class="was">
                  <span class="visually-hidden">Replaces </span>{{ row.was }}
                </div>
                <UiQualityName :quality="row.quality" :missing="row.missing" to="#" class="sans-md">{{
                  row.name
                }}</UiQualityName>
              </template>
              <template #cell-ilvl="{ row }">{{ row.ilvl ?? '—' }}</template>
              <template #cell-enchant="{ row }">
                <span v-if="!row.enchant" class="disabled">—</span>
                <span v-else :class="row.enchantNew ? 'up' : 'text-2'">{{ row.enchant }}</span>
              </template>
              <template #cell-value="{ row }">
                <ChartsInlineBar
                  :value="row.value ?? 0"
                  :max="VALUE_MAX"
                  :gain="row.gain"
                  :text="row.value === null ? '—' : formatNumber(row.value, 1)"
                />
              </template>
            </UiDataTable>
          </UiPanel>

          <UiPanel title="Pending changes" meta="vs run #0412" :span="4">
            <UiDiffRows :groups="pending.map((g) => [...g])" />
            <div class="total">
              <span class="text-2">Estimated total</span>
              <span class="num total__v">+8.9 <span class="total__ci">±1.7</span></span>
            </div>
            <p class="note pad-x">
              Linear estimate from stat weights. Set bonuses, procs and caps are only exact after a sim.
            </p>
            <div class="btn-row">
              <UiButton variant="quiet">Discard</UiButton>
              <UiButton>Save as variant</UiButton>
            </div>
          </UiPanel>

          <UiPanel title="Stats" meta="raid-buffed" :span="4">
            <UiDataTable
              :columns="statCols"
              :rows="K.stats"
              :row-key="(r) => r.stat"
              density="sm"
              caption="Stats, run vs draft"
            >
              <template #cell-delta="{ row }">
                <UiDeltaValue v-if="row.delta !== 0" :value="row.delta" :digits="row.digits" />
                <span v-else class="text-3">0</span>
              </template>
            </UiDataTable>
          </UiPanel>

          <UiPanel title="Caps &amp; thresholds" meta="draft" :span="4">
            <div class="caps">
              <ChartsCapMeter v-for="c in K.caps" :key="c.label" v-bind="c" />
            </div>
          </UiPanel>
        </UiPanelGrid>

        <div class="simbar">
          <UiSegmentedControl
            v-model="iterations"
            label="Iterations"
            :options="[
              { value: '1k', label: '1k', mono: true },
              { value: '5k', label: '5k', mono: true },
              { value: '25k', label: '25k', mono: true },
              { value: 'precision', label: 'Until ±0.1%' },
            ]"
          />
          <span class="num note">expected CI ±3.1 · ~4s on 8 workers</span>
          <UiCheckbox v-model="withWeights">Stat weights</UiCheckbox>
          <UiCheckbox v-model="withScaling">Hit scaling</UiCheckbox>
          <span class="grow" />
          <UiButton variant="primary" size="lg" kbd="⌘↵" to="/dev/kit#analysis">Sim draft vs #0412</UiButton>
        </div>
      </section>

      <!-- ============================================================ Top gear -->
      <section id="top-gear" class="kit-section" aria-labelledby="k-compare">
        <p id="k-compare" class="label kit-h">03 · Top gear <span class="num">Compare.dc.html</span></p>
        <UiPageHeader
          title="Top gear"
          subtitle="· Kargath"
          meta="batch #0413 · 9 candidates in 3 slots → 48 combinations"
          marker="warrior"
          :level="2"
          :items="[
            { label: 'Fights simmed', value: '240,000' },
            { label: 'Per combo', value: '5,000 it · CI ±3.1' },
            { label: 'Noise floor', value: '|Δ| < 4.4' },
            { label: 'Wall', value: '3m 12s · 8 workers' },
          ]"
        >
          <template #actions>
            <UiButton>Edit candidates</UiButton>
            <UiButton variant="primary">Re-run top 5 at 25k</UiButton>
          </template>
        </UiPageHeader>

        <div class="filters">
          <span class="label">Slots</span>
          <UiFilterChip v-model="slotFilters.wrist" :count="5">Wrist</UiFilterChip>
          <UiFilterChip v-model="slotFilters.ring" :count="2">Ring</UiFilterChip>
          <UiFilterChip v-model="slotFilters.ranged" :count="2">Ranged</UiFilterChip>
          <span class="vsep" aria-hidden="true" />
          <UiCheckbox v-model="hideNoise">Hide results within noise</UiCheckbox>
          <span class="grow" />
          <span class="num note">showing {{ rankingRows.length }} of 48 · sorted by mean</span>
        </div>

        <UiPanelGrid>
          <UiPanel title="Ranking" :span="9">
            <template #meta>
              <ChartsLegend
                :items="[
                  { label: 'Mean', mark: 'dot', color: 'var(--text-1)' },
                  { label: '95% CI', mark: 'whisker', color: 'var(--series-baseline)' },
                  { label: 'Equipped', mark: 'vline', color: 'var(--class-warrior)' },
                ]"
              />
            </template>
            <UiDataTable
              v-model:sort="rankSort"
              :columns="rankCols"
              :rows="rankingRows"
              :row-key="(r) => r.rank"
              :row-state="(r) => (r.equipped ? 'reference' : undefined)"
              caption="Top gear ranking"
              min-width="900px"
              density="lg"
            >
              <template #head-forest>
                <span class="visually-hidden">Mean and 95% CI</span>
                <ChartsForestAxis :domain="FOREST_DOMAIN" :ticks="[1165, 1175, 1185, 1195, 1205]" />
              </template>
              <template #cell-changes="{ row }">
                <span class="chips">
                  <UiChip v-if="row.equipped" tag="NOW" quality="muted">Currently equipped</UiChip>
                  <UiChip v-for="c in row.changes" :key="c.name" :tag="c.tag" :quality="c.quality">{{
                    c.name
                  }}</UiChip>
                </span>
              </template>
              <template #cell-mean="{ row }">{{ formatNumber(row.mean, 1) }}</template>
              <template #cell-delta="{ row }">
                <span v-if="row.equipped" class="text-3">—</span>
                <UiDeltaValue v-else :value="row.delta" :noise="K.COMPARE.noise" :glyph="false" />
              </template>
              <template #cell-forest="{ row }">
                <ChartsForestRow
                  :mean="row.mean"
                  :lo="row.lo"
                  :hi="row.hi"
                  :domain="FOREST_DOMAIN"
                  :reference="K.COMPARE.base"
                  :is-reference="row.equipped"
                  reference-color="var(--class-warrior)"
                  :label="row.equipped ? 'Currently equipped' : row.changes.map((c) => c.name).join(' + ')"
                />
              </template>
              <template #cell-verdict="{ row }">
                <span v-if="row.equipped" class="equipped"
                  ><span class="equipped__dot" aria-hidden="true">●</span>Equipped</span
                >
                <UiDeltaValue v-else :value="row.delta" :verdict="verdictOf(row)" show-verdict hide-value />
              </template>
            </UiDataTable>
          </UiPanel>

          <UiPanelStack :span="3">
            <UiPanel title="Items in significant wins" meta="5 combos">
              <ul class="wins">
                <li v-for="w in K.inWins" :key="w.name">
                  <div class="wins__head">
                    <UiQualityName :quality="w.quality">{{ w.name }}</UiQualityName>
                    <span class="num text-2">{{ w.n }}/5</span>
                  </div>
                  <ChartsPipBar :count="w.n" :total="5" :label="w.name" />
                </li>
              </ul>
            </UiPanel>
            <UiPanel title="Best gain per slot" meta="alone">
              <UiDataTable
                :columns="bestCols"
                :rows="K.bestPerSlot"
                :row-key="(r) => r.slot"
                hide-header
                caption="Best gain per slot"
              >
                <template #cell-gain="{ row }"
                  ><UiDeltaValue :value="row.gain" :noise="K.COMPARE.noise" :glyph="false"
                /></template>
              </UiDataTable>
              <p class="note pad">
                Ring and ranged alone sit inside the noise floor; the ring adds +5.8 on top of the bracers,
                more than its +1.8 alone. Re-run at 25k before trusting that interaction.
              </p>
            </UiPanel>
          </UiPanelStack>
        </UiPanelGrid>
      </section>

      <!-- ============================================================ Start -->
      <section id="start" class="kit-section" aria-labelledby="k-start">
        <p id="k-start" class="label kit-h">04 · Start <span class="num">Start.dc.html</span></p>
        <h2 class="start-title">New run</h2>
        <p class="start-sub">
          Paste an export or start from a spec. Everything runs in this browser; nothing is uploaded.
        </p>

        <UiPanelGrid>
          <UiPanel title="Input" :span="7">
            <template #meta
              ><span class="sans">SimC string · WoWSims JSON · Wowhead planner URL</span></template
            >
            <UiCodeInput v-model="paste" label="Pasted export" :markers="K.pastedMarkers" />
          </UiPanel>

          <UiPanel title="Parsed" meta="simc · forever addon 1.3" :span="5">
            <div class="parsed">
              <UiClassMarker cls="warrior" size="lg" />
              <div class="grow">
                <div class="parsed__name">Kargath</div>
                <div class="parsed__sub">Orc Fury Warrior · 60 · EU Ashbringer</div>
              </div>
              <UiKeyValueStrip
                align="end"
                :items="[
                  { label: 'Slots', value: '16/17' },
                  { label: 'Talents', value: '30/21/0' },
                ]"
              />
            </div>
            <UiCheckList :items="K.parseChecks" dense />
            <div class="btn-row btn-row--rule">
              <UiButton size="lg">Sim as-is</UiButton>
              <UiButton variant="primary" size="lg" to="/dev/kit#workbench">Open in workbench</UiButton>
            </div>
          </UiPanel>

          <UiPanel title="Start from a spec" :span="7">
            <template #meta
              ><span class="sans">loads upstream preset gear, talents and rotation</span></template
            >
            <div class="specs">
              <div v-for="k in K.classSpecs" :key="k.cls" class="specs__cell">
                <UiClassMarker :cls="k.cls" size="stretch" />
                <div>
                  <div class="specs__class">{{ k.name }}</div>
                  <div class="specs__list">
                    <a v-for="s in k.specs" :key="s" href="#">{{ s }}</a>
                  </div>
                </div>
              </div>
            </div>
          </UiPanel>

          <UiPanel title="Recent runs" meta="this device" :span="5">
            <UiDataTable
              v-model:sort="recentSort"
              :columns="recentCols"
              :rows="K.recentRuns"
              :row-key="(r) => r.id"
              :row-state="(r) => (r.id === selectedRun ? 'selected' : undefined)"
              caption="Recent runs"
              min-width="420px"
            >
              <template #cell-id="{ row }">
                <button
                  type="button"
                  class="num linkish"
                  :aria-pressed="row.id === selectedRun"
                  @click="selectedRun = row.id"
                >
                  {{ row.id }}
                </button>
              </template>
              <template #cell-who="{ row }">
                <span class="who"><UiClassMarker :cls="row.cls" />{{ row.who }}</span>
              </template>
              <template #cell-dps="{ row }">{{ formatNumber(row.dps, 1) }}</template>
              <template #cell-engine="{ row }">
                <UiStatusGlyph v-if="row.old" status="warning" class="num small text-2"
                  >{{ row.engine }} · old</UiStatusGlyph
                >
                <span v-else class="num small text-3">{{ row.engine }}</span>
              </template>
            </UiDataTable>
            <p class="note pad">Runs on an older engine are marked. Re-running uses the current build.</p>
          </UiPanel>

          <UiPanel title="Tuning since build 70691" :span="7">
            <template #meta>
              <ChartsLegend
                :items="[
                  { label: 'Gain', mark: 'swatch', color: 'var(--series-1)' },
                  { label: 'Loss', mark: 'swatch', color: 'var(--series-2)' },
                ]"
              >
                reference profiles · 25k it
              </ChartsLegend>
            </template>
            <ChartsDivergingBar
              :rows="K.tuning"
              :max="5"
              value-label="DPS change"
              label="DPS change per spec since build 70691: Feral Druid gains most at +4.2%, Retribution Paladin loses most at −2.6%."
              :show-table="tables"
            />
          </UiPanel>

          <UiPanel title="Engine &amp; data" :span="5">
            <template #meta><a href="#" class="text-2">Full changelog</a></template>
            <ol class="syncs">
              <li v-for="s in K.syncs" :key="s.ver">
                <UiStatusGlyph v-if="s.current" status="good" label="Current" hide-label />
                <span v-else class="syncs__dot" aria-hidden="true" />
                <span
                  ><span class="num">{{ s.ver }}</span> <span class="text-2">{{ s.what }}</span></span
                >
                <span class="syncs__when">{{ s.when }}</span>
              </li>
            </ol>
            <p class="num note pad rule">
              upstream wowsims/forever · checked hourly · smoke-tested 27/27 specs
            </p>
          </UiPanel>
        </UiPanelGrid>
      </section>

      <!-- ============================================================ Primitives -->
      <section id="primitives" class="kit-section" aria-labelledby="k-prim">
        <p id="k-prim" class="label kit-h">05 · Primitives and states</p>
        <UiPanelGrid>
          <UiPanel title="Button" meta="primary · secondary · quiet · sizes · disabled" :span="6" padded>
            <div class="row">
              <UiButton variant="primary">Re-run</UiButton>
              <UiButton>Export JSON</UiButton>
              <UiButton variant="quiet">Discard</UiButton>
              <UiButton variant="primary" size="lg" kbd="⌘↵">Sim draft</UiButton>
              <UiButton size="sm">Copy Pawn</UiButton>
              <UiButton disabled>Disabled</UiButton>
              <UiButton variant="primary" disabled>Disabled</UiButton>
            </div>
          </UiPanel>

          <UiPanel title="Segmented control · chips · checkbox" :span="6" padded>
            <div class="row">
              <UiSegmentedControl
                v-model="seg"
                label="View"
                :options="[
                  { value: 'chart', label: 'Chart' },
                  { value: 'table', label: 'Table' },
                ]"
              />
              <UiSegmentedControl
                v-model="seg"
                label="Small"
                size="sm"
                hide-label
                :options="[
                  { value: 'chart', label: 'Chart' },
                  { value: 'table', label: 'Table' },
                ]"
              />
            </div>
            <div class="row">
              <UiFilterChip v-model="chipA" :count="5">Wrist</UiFilterChip>
              <UiFilterChip v-model="chipB">Trinket</UiFilterChip>
              <UiChip tag="WRIST" quality="epic">Bracers of Might</UiChip>
              <UiChip tag="RING" quality="rare">Mark of Fordring</UiChip>
              <UiCheckbox v-model="check">Stat weights</UiCheckbox>
              <UiCheckbox :model-value="false" disabled>Disabled</UiCheckbox>
            </div>
          </UiPanel>

          <UiPanel title="Text inputs" :span="6" padded>
            <div class="inputs">
              <UiTextInput v-model="name" label="Character name" />
              <UiTextInput
                v-model="seed"
                label="Seed"
                mono
                invalid
                hint="Seed must be 4 hex digits, e.g. 0x5F1A."
              />
              <UiSearchInput
                v-model="search"
                label="Search items"
                placeholder="Items, specs, runs"
                kbd="⌘K"
              />
            </div>
          </UiPanel>

          <UiPanel title="Status · delta · tooltip" :span="6" padded>
            <div class="row">
              <UiStatusGlyph status="good" label="Significant" />
              <UiStatusGlyph status="warning" label="Not in data build" />
              <UiStatusGlyph status="info" label="Preset applied" />
            </div>
            <div class="row num">
              <UiDeltaValue :value="22.4" :noise="4.4" show-verdict />
              <UiDeltaValue :value="-6.3" :noise="4.4" show-verdict />
              <UiDeltaValue :value="1.8" :noise="4.4" show-verdict />
              <UiDeltaValue :value="8.9" :ci="1.7" />
              <UiDeltaValue :value="-58" :digits="0" lower-is-better />
            </div>
            <div class="row">
              <UiTooltip text="Welch t-test on the two runs' mean, σ and n. Significant at p < 0.05.">
                <template #default="{ describedby }">
                  <UiButton size="sm" :aria-describedby="describedby">How is significance tested?</UiButton>
                </template>
              </UiTooltip>
              <span class="note">Hover or focus the button; Esc closes.</span>
            </div>
          </UiPanel>

          <UiPanel title="Quality names · class markers" :span="6" padded>
            <div class="row">
              <UiQualityName quality="common">Linen Cloth</UiQualityName>
              <UiQualityName quality="uncommon">Ironforge Breastplate</UiQualityName>
              <UiQualityName quality="rare">Hand of Justice</UiQualityName>
              <UiQualityName quality="epic">Brutality Blade</UiQualityName>
              <UiQualityName quality="legendary">Sulfuras</UiQualityName>
              <UiQualityName missing>Item 99412 — not in data</UiQualityName>
            </div>
            <div class="row">
              <span v-for="k in K.classSpecs" :key="k.cls" class="who"
                ><UiClassMarker :cls="k.cls" />{{ k.name }}</span
              >
            </div>
          </UiPanel>

          <UiPanel title="Progress" :span="6" padded>
            <div class="stack">
              <UiProgressBar label="Sim draft vs #0412" :value="0.56" detail="2,800 / 5,000 it · ±0.41%" />
              <UiProgressBar label="Loading engine v0.0.99" detail="lib.wasm · 3.1 MB" />
              <UiProgressBar label="Run #0412" :value="1" detail="5,000 it · 4.2s" state="done" />
            </div>
          </UiPanel>

          <UiPanel title="Empty state" :span="6">
            <UiEmptyState
              title="No baseline yet"
              body="Pick an earlier run as the baseline to see Δ, significance and the dashed baseline distribution."
            >
              <UiButton size="sm">Choose baseline</UiButton>
            </UiEmptyState>
          </UiPanel>

          <UiPanel title="Key-value strip · tab nav" :span="6" padded>
            <div class="stack">
              <UiKeyValueStrip
                :items="[
                  { label: 'Iterations', value: '5,000' },
                  { label: 'Seed', value: '0x5F1A' },
                  { label: 'Draft est.', value: '1,193.1', tone: 'up' },
                ]"
              />
              <UiTabNav label="Example" :items="benchTabs" :current="benchTab" class="left" />
            </div>
          </UiPanel>
        </UiPanelGrid>
      </section>

      <p class="footer">
        Simulation engine: WoWSims Forever (MIT) v0.0.99 @ b2047bf · game data build 70862 · Not affiliated
        with Blizzard Entertainment.
      </p>
    </main>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) 40px;
}
.intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-5);
  flex-wrap: wrap;
  padding-bottom: var(--space-3);
}
.intro__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}
.intro__text {
  margin: var(--space-1) 0 0;
  color: var(--text-2);
}
.kit-section {
  padding-top: var(--space-6);
}
.kit-h {
  margin: 0 0 var(--space-3);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line-seam);
}
.kit-h .num {
  margin-left: var(--space-2);
  text-transform: none;
  letter-spacing: 0;
}
.lc {
  text-transform: none;
}
.text-2 {
  color: var(--text-2);
}
.text-3 {
  color: var(--text-3);
}
.up {
  color: var(--delta-up);
}
.disabled {
  color: var(--text-disabled);
}
.sans {
  font-family: var(--font-sans);
}
.sans-md {
  font-family: var(--font-sans);
  font-size: var(--text-md);
}
.small {
  font-size: var(--text-xs);
}
.unit {
  margin-left: 0.35em;
  color: var(--text-3);
  font-size: var(--text-xs);
}
.note {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.pad {
  margin: 0;
  padding: 10px var(--space-4) var(--space-4);
}
.pad-x {
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
}
.rule {
  border-top: 1px solid var(--line-row);
  padding-top: var(--space-2);
}
.grow {
  flex-grow: 1;
}
.view-toggle {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-4) 0;
}
.timeline {
  padding: var(--space-4) 18px 10px;
}
.rage {
  border-top: 1px solid var(--line-row);
}
.panel-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px var(--space-4);
}
.was {
  color: var(--text-3);
  text-decoration: line-through;
  font-size: var(--text-sm);
}
.total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px var(--space-4);
  border-top: 1px solid var(--line-seam);
}
.total__v {
  font-size: var(--text-lg);
  color: var(--delta-up);
}
.total__ci {
  font-size: var(--text-sm);
  color: var(--text-3);
}
.btn-row {
  display: flex;
  gap: 6px;
  padding: 0 var(--space-4) var(--space-4);
}
.btn-row--rule {
  padding-top: 10px;
  border-top: 1px solid var(--line-row);
}
.caps {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: 10px var(--space-4) var(--space-4);
}
.simbar {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: var(--space-3);
  padding: 10px var(--space-6);
  background: var(--bg-chrome);
  border: 1px solid var(--line-seam);
}
.filters {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
  padding-bottom: var(--space-3);
}
.filters > .label {
  margin-right: var(--space-1);
}
.vsep {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--line-control);
}
.chips {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.equipped {
  display: inline-flex;
  gap: 6px;
  color: var(--text-2);
}
.equipped__dot {
  color: var(--class-warrior);
}
.wins {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wins__head {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  margin-bottom: 5px;
}
.start-title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-lg);
  font-weight: 600;
}
.start-sub {
  margin: 0 0 var(--space-5);
  color: var(--text-2);
}
.parsed {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--line-row);
}
.parsed__name {
  font-weight: 500;
}
.parsed__sub {
  font-size: var(--text-sm);
  color: var(--text-2);
}
.specs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--line-row);
}
.specs__cell {
  display: flex;
  gap: 10px;
  padding: 10px var(--space-4);
  background: var(--bg-panel);
}
.specs__class {
  font-size: var(--text-sm);
  color: var(--text-2);
}
.specs__list {
  display: flex;
  gap: 2px 10px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.who {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.linkish {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
.syncs {
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;
}
.syncs li {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 7px var(--space-4);
  align-items: start;
  font-size: var(--text-sm);
}
.syncs__dot {
  width: 7px;
  height: 7px;
  margin: 5px 0 0 3px;
  border-radius: 4px;
  background: var(--series-muted);
}
.syncs__when {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.row + .row {
  margin-top: var(--space-3);
}
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: end;
}
.left {
  justify-content: flex-start;
}
.footer {
  margin: var(--space-4) 0 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
@media (max-width: 640px) {
  .page {
    padding: var(--space-4) var(--space-5) 32px;
  }
  .specs {
    grid-template-columns: minmax(0, 1fr);
  }
  .inputs {
    grid-template-columns: minmax(0, 1fr);
  }
  .simbar {
    padding: 10px var(--space-4);
    gap: var(--space-3);
  }
  .timeline {
    padding: var(--space-3) var(--space-3) 10px;
  }
}
</style>
