<script setup lang="ts">
import { PseudoStat, Stat, type UnitStats } from '@fsim/proto/common';
import type { TableColumn } from '~/composables/ui-types';
import { BUFF_PRESETS, specInfo } from '~/composables/workbench';

// Character sheet from the engine (computeStats) for the baseline and the draft, side by side.
const wb = useWorkbench();

type Src = { stat: Stat } | { pseudo: PseudoStat };
interface Def {
  label: string;
  src: Src;
  digits: number;
  pct?: boolean;
}
interface Row {
  label: string;
  run: string;
  draft: string;
  delta: number;
  digits: number;
}

const S = (label: string, stat: Stat): Def => ({ label, src: { stat }, digits: 0 });
const P = (label: string, pseudo: PseudoStat): Def => ({ label, src: { pseudo }, digits: 2, pct: true });

const defs = computed<Def[]>(() => {
  const c = wb.draft.value;
  if (!c) return [];
  const spec = specInfo(c.spec);
  const casterSpecs = ['balance-druid', 'mage', 'dps-priest', 'elemental-shaman', 'warlock'];
  if (spec.role === 'healer' || casterSpecs.includes(c.spec)) {
    return [
      S('Intellect', Stat.StatIntellect),
      S('Spirit', Stat.StatSpirit),
      S('Stamina', Stat.StatStamina),
      spec.role === 'healer'
        ? S('Healing power', Stat.StatHealingPower)
        : S('Spell damage', Stat.StatSpellDamage),
      P('Spell hit', PseudoStat.PseudoStatSpellHitPercent),
      P('Spell crit', PseudoStat.PseudoStatSpellCritPercent),
      S('Mana', Stat.StatMana),
      S('MP5', Stat.StatMP5),
      S('Health', Stat.StatHealth),
    ];
  }
  const hunter = c.spec === 'hunter';
  return [
    S('Strength', Stat.StatStrength),
    S('Agility', Stat.StatAgility),
    S('Stamina', Stat.StatStamina),
    hunter ? S('Ranged attack power', Stat.StatRangedAttackPower) : S('Attack power', Stat.StatAttackPower),
    hunter
      ? P('Ranged hit', PseudoStat.PseudoStatRangedHitPercent)
      : P('Melee hit', PseudoStat.PseudoStatMeleeHitPercent),
    hunter
      ? P('Ranged crit', PseudoStat.PseudoStatRangedCritPercent)
      : P('Melee crit', PseudoStat.PseudoStatMeleeCritPercent),
    S('Armor', Stat.StatArmor),
    S('Health', Stat.StatHealth),
  ];
});

const read = (u: UnitStats | undefined, src: Src) =>
  'stat' in src ? (u?.stats[src.stat] ?? 0) : (u?.pseudoStats[src.pseudo] ?? 0);

const rows = computed<Row[]>(() => {
  const a = wb.baseSheet.value?.finalStats;
  const b = wb.draftSheet.value?.finalStats;
  if (!a || !b) return [];
  return defs.value.map((d) => {
    const x = read(a, d.src);
    const y = read(b, d.src);
    const fmt = (v: number) => (d.pct ? `${formatNumber(v, d.digits)}%` : formatNumber(v, d.digits));
    return { label: d.label, run: fmt(x), draft: fmt(y), delta: y - x, digits: d.digits };
  });
});

const columns = computed<TableColumn<Row>[]>(() => [
  { key: 'label', label: 'Stat', tone: '2' },
  { key: 'run', label: wb.baseRunId.value ? 'Run' : 'Import', numeric: true, tone: '3' },
  { key: 'draft', label: 'Draft', numeric: true },
  { key: 'delta', label: 'Δ', srLabel: 'Change', numeric: true },
]);

const meta = computed(() => {
  const b = wb.draft.value?.buffs;
  const p = BUFF_PRESETS.find((x) => x.id === b);
  return b === 'full-raid' ? 'raid-buffed' : p ? `${p.label.toLowerCase()} buffs` : '';
});
</script>

<template>
  <UiPanel title="Stats" :meta="meta" :span="4">
    <UiDataTable
      v-if="rows.length"
      :columns="columns"
      :rows="rows"
      :row-key="(r) => r.label"
      density="sm"
      caption="Stats, last run vs draft"
    >
      <template #cell-delta="{ row }">
        <UiDeltaValue
          v-if="Math.abs(row.delta) >= 10 ** -row.digits / 2"
          :value="row.delta"
          :digits="row.digits"
        />
        <span v-else class="zero">0</span>
      </template>
    </UiDataTable>
    <p v-else-if="wb.sheetError.value" class="msg warn">
      <UiStatusGlyph status="warning" hide-label />The engine could not compute stats:
      {{ wb.sheetError.value }}
    </p>
    <p v-else class="msg">Computing stats in the engine…</p>
    <p class="msg note">
      From the engine's character sheet (computeStats), level 60, with the buffs and consumables set.
    </p>
  </UiPanel>
</template>

<style scoped>
.zero {
  color: var(--text-3);
}
.msg {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-3);
}
.msg.warn {
  display: flex;
  gap: 6px;
  color: var(--text-2);
}
.note {
  padding-top: var(--space-1);
  padding-bottom: var(--space-3);
  font-size: var(--text-xs);
}
</style>
