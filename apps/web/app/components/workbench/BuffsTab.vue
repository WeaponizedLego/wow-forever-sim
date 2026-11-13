<script setup lang="ts">
import type { BuffsPreset } from '@fsim/contracts';
import { BUFF_PRESETS, specInfo } from '~/composables/workbench';

// Buff preset (who else is in the fight) and the character's consumables, read-only for now.
const wb = useWorkbench();
const session = useSession();

const preset = computed({
  get: () => wb.draft.value?.buffs ?? 'full-raid',
  set: (v: string) => session.updateCharacter((c) => (c.buffs = v as BuffsPreset)),
});

const LABELS: Record<string, string> = {
  flaskId: 'Flask',
  foodId: 'Food',
  conjuredId: 'Conjured',
  mhImbueId: 'Main-hand imbue',
  ohImbueId: 'Off-hand imbue',
  offensivePotId: 'Potion',
  defensivePotId: 'Defensive potion',
  battleElixirId: 'Battle elixir',
  guardianElixirId: 'Guardian elixir',
  explosiveId: 'Explosive',
  scrollAgiId: 'Scroll (Agility)',
  scrollStrId: 'Scroll (Strength)',
  scrollSpiId: 'Scroll (Spirit)',
  scrollIntId: 'Scroll (Intellect)',
  scrollArmId: 'Scroll (Armor)',
};

const consumables = computed(() => {
  const c = wb.draft.value;
  const db = wb.db.value;
  if (!c) return [];
  return Object.entries(c.consumables).map(([k, v]) => {
    const label = LABELS[k] ?? k.replace(/Id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    if (typeof v === 'number') {
      const name = db?.consumables.get(v)?.name ?? db?.item(v)?.name;
      return { key: k, label, value: name ?? `#${v}`, id: v, unknown: !name && !!db };
    }
    return { key: k, label, value: JSON.stringify(v), id: null, unknown: false };
  });
});

const source = computed(() => {
  const c = wb.draft.value;
  if (!c) return '';
  const filled = session.importDiagnostics.value.some(
    (d) => d.code === 'DEFAULT-05' && d.field === 'consumables',
  );
  return filled
    ? `From the ${specInfo(c.spec).name} preset: the export had no consumables.`
    : 'From the import.';
});
const current = computed(() => BUFF_PRESETS.find((p) => p.id === preset.value));
</script>

<template>
  <UiPanel title="Buffs &amp; consumables" :span="8" :row-span="3">
    <template #meta
      ><span class="num">{{ current?.label.toLowerCase() }}</span></template
    >
    <div class="body">
      <UiSegmentedControl
        v-model="preset"
        label="Buffs from others"
        :options="BUFF_PRESETS.map((p) => ({ value: p.id, label: p.label }))"
      />
      <dl class="presets">
        <div v-for="p in BUFF_PRESETS" :key="p.id" :class="{ 'is-on': p.id === preset }">
          <dt>{{ p.label }}</dt>
          <dd>{{ p.body }}</dd>
        </div>
      </dl>
      <p class="note">Which buffs a preset includes comes from the spec's upstream preset.</p>
    </div>

    <h3 class="label sub">Consumables · read-only</h3>
    <table v-if="consumables.length" class="cons">
      <caption class="visually-hidden">
        Consumables
      </caption>
      <tbody>
        <tr v-for="c in consumables" :key="c.key">
          <th scope="row">{{ c.label }}</th>
          <td :class="{ warn: c.unknown }">{{ c.value }}</td>
          <td class="num id">{{ c.id ? `#${c.id}` : '' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="note pad">No consumables.</p>
    <p class="note pad">{{ source }} Editing consumables comes in a later version.</p>
  </UiPanel>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}
.presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1px;
  margin: 0;
  background: var(--line-seam);
  border: 1px solid var(--line-seam);
}
.presets > div {
  padding: var(--space-2) var(--space-3);
  background: var(--bg-panel);
}
.presets > div.is-on {
  background: var(--bg-raised);
}
.presets dt {
  font-size: var(--text-sm);
  font-weight: 500;
}
.presets > div:not(.is-on) dt {
  color: var(--text-2);
  font-weight: 400;
}
.presets dd {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.pad {
  padding: var(--space-2) var(--space-4);
}
.sub {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--line-seam);
  border-bottom: 1px solid var(--line-seam);
  font-weight: 400;
}
.cons {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.cons th,
.cons td {
  padding: 6px var(--space-4);
  border-bottom: 1px solid var(--line-row);
  text-align: left;
  font-weight: 400;
}
.cons th {
  width: 160px;
  color: var(--text-3);
}
.cons .id {
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.warn {
  color: var(--status-warning);
}
</style>
