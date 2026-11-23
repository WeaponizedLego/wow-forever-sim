<script setup lang="ts">
import type { DiffRow } from '~/composables/ui-types';
import type { WorkbenchVariant } from '~/utils/variant-record';

// Draft vs baseline as −/+ rows, each gear change with its estimated gain, then the total, Discard and
// Save as variant. Saved variants (kept in this browser) are listed underneath: rename, load, delete.
const wb = useWorkbench();
const session = useSession();

const vs = computed(() => (wb.baseRunId.value ? `vs run ${wb.baseRunId.value}` : 'vs import'));
const est = (delta: number, ci: number) => `${formatSigned(delta, 1)} ±${formatNumber(ci, 1)}`;

const groups = computed<DiffRow[][]>(() =>
  wb.changes.value.map((g) => {
    const rows = g.rows.map((r) => ({ ...r }));
    const plus = rows.find((r) => r.op === '+');
    if (g.kind === 'gear') {
      if (!plus) return rows;
      const e = wb.changeEstimates.value[g.key];
      if (e) {
        plus.detail = est(e.delta, e.ci95);
        plus.detailTone = Math.abs(e.delta) < e.ci95 ? 'muted' : e.delta > 0 ? 'up' : 'down';
      } else if (wb.weights.value) {
        plus.detail = '…';
      }
    } else if (wb.weights.value) {
      // Talent rows carry their tree's points in `detail`: the hint goes on the last row without one.
      const free = rows.findLast((r) => !r.detail);
      if (free) free.detail = 'sim to price';
    }
    return rows;
  }),
);

const total = computed(() => wb.gearTotal.value);
const hasChanges = computed(() => wb.changes.value.length > 0);
const status = ref<string | null>(null);

// ---- saved variants (IndexedDB): save the draft, rename, load back, delete with undo.
const editingId = ref<string | null>(null);
const editName = ref('');
const deleted = ref<WorkbenchVariant | null>(null);

function save() {
  const v = wb.saveVariant();
  if (!v) return;
  deleted.value = null;
  status.value = `Saved ${v.name}`;
}
function startRename(v: WorkbenchVariant) {
  editingId.value = v.id;
  editName.value = v.name;
}
function commitRename() {
  if (editingId.value) wb.renameVariant(editingId.value, editName.value);
  editingId.value = null;
}
async function load(v: WorkbenchVariant) {
  await wb.loadVariant(v.id);
  status.value = `Loaded ${v.name}`;
}
function remove(id: string) {
  deleted.value = wb.removeVariant(id);
  status.value = deleted.value ? `Deleted ${deleted.value.name}` : null;
}
function undo() {
  if (deleted.value) wb.restoreVariant(deleted.value);
  status.value = deleted.value ? `Restored ${deleted.value.name}` : null;
  deleted.value = null;
}
</script>

<template>
  <UiPanel title="Pending changes" :meta="vs" :span="4">
    <p v-if="!hasChanges" class="empty">
      No changes since {{ wb.baseRunId.value ? `run ${wb.baseRunId.value}` : 'the import' }}. Pick an item in
      the gear table, or change talents, options, buffs, fight or rotation.
    </p>
    <template v-else>
      <UiDiffRows :groups="groups" />
      <div v-if="wb.weights.value" class="total">
        <span class="text-2">Estimated total</span>
        <span
          v-if="total"
          class="num total__v"
          :class="Math.abs(total.delta) < total.ci95 ? 'is-noise' : total.delta < 0 ? 'is-down' : 'is-up'"
          >{{ formatSigned(total.delta, 1) }}
          <span class="total__ci">±{{ formatNumber(total.ci95, 1) }}</span></span
        >
        <span v-else class="num total__none">—</span>
      </div>
      <p class="note">
        <template v-if="!wb.weights.value">
          No estimates yet: run with <strong>Stat weights</strong> ticked to price gear changes.
        </template>
        <template v-else>
          Linear estimate from run {{ wb.weights.value.runId }} weights; ± is the 95% interval of the weights,
          combined as independent. Set bonuses, procs and caps are only exact after a sim.
          <template v-if="wb.unpriced.value.length">
            Talent, option, buff, fight and rotation changes are not in the total.</template
          >
        </template>
      </p>
    </template>
    <div class="btn-row">
      <UiButton variant="quiet" :disabled="!hasChanges" @click="session.discardChanges()">Discard</UiButton>
      <UiButton :disabled="!wb.draft.value" @click="save">Save as variant</UiButton>
    </div>
    <section
      v-if="wb.variants.value.length || wb.unreadableVariants.value.length"
      class="variants"
      aria-label="Saved variants"
    >
      <div class="variants__h">
        <p class="label">Saved variants</p>
        <NuxtLink v-if="wb.variants.value.length" to="/compare" class="variants__cmp">Compare →</NuxtLink>
      </div>
      <ul>
        <li v-for="v in wb.variants.value" :key="v.id" class="variant">
          <form
            v-if="editingId === v.id"
            class="variant__rename"
            @submit.prevent="commitRename"
            @keydown.esc="editingId = null"
          >
            <UiTextInput v-model="editName" :label="`New name for ${v.name}`" hide-label />
            <UiButton size="sm" type="submit">Save</UiButton>
            <UiButton size="sm" variant="quiet" @click="editingId = null">Cancel</UiButton>
          </form>
          <template v-else>
            <span class="variant__name">{{ v.name }}</span>
            <span class="num variant__meta"
              >{{ v.changes }} {{ v.changes === 1 ? 'change' : 'changes' }}
              <template v-if="v.estimate"> · {{ est(v.estimate.delta, v.estimate.ci95) }}</template></span
            >
            <span class="variant__actions">
              <UiButton size="sm" variant="quiet" :aria-label="`Load ${v.name}`" @click="load(v)"
                >Load</UiButton
              >
              <UiButton size="sm" variant="quiet" :aria-label="`Rename ${v.name}`" @click="startRename(v)"
                >Rename</UiButton
              >
              <UiButton size="sm" variant="quiet" :aria-label="`Delete ${v.name}`" @click="remove(v.id)"
                >Delete</UiButton
              >
            </span>
          </template>
        </li>
        <li v-for="u in wb.unreadableVariants.value" :key="u.id" class="variant">
          <span class="variant__name variant__bad">{{ u.name }}</span>
          <span class="num variant__meta">cannot be read ({{ u.reason }})</span>
          <span class="variant__actions">
            <UiButton size="sm" variant="quiet" :aria-label="`Delete ${u.name}`" @click="remove(u.id)"
              >Delete</UiButton
            >
          </span>
        </li>
      </ul>
    </section>
    <p v-if="status" class="num saved" role="status">
      {{ status }}
      <UiButton v-if="deleted" size="sm" variant="quiet" @click="undo">Undo</UiButton>
    </p>
    <p v-if="wb.variantStorage.value === 'unavailable'" class="note">
      This browser is not keeping data for this site, so variants last only until the tab closes.
    </p>
  </UiPanel>
</template>

<style scoped>
.empty {
  margin: 0;
  padding: 10px var(--space-4) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-3);
}
.total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px var(--space-4);
  border-top: 1px solid var(--line-seam);
}
.text-2 {
  color: var(--text-2);
}
.total__v {
  font-size: var(--text-lg);
}
.total__v.is-up {
  color: var(--delta-up);
}
.total__v.is-down {
  color: var(--delta-down);
}
.total__v.is-noise {
  color: var(--text-1);
}
.total__ci {
  font-size: var(--text-sm);
  color: var(--text-3);
}
.total__none {
  color: var(--text-3);
}
.note {
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.note strong {
  font-weight: 500;
  color: var(--text-2);
}
.btn-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--space-4) var(--space-4);
}
.saved {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-3);
}
.variants {
  border-top: 1px solid var(--line-row);
  padding: var(--space-2) var(--space-4) var(--space-3);
}
.variants__h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 var(--space-1);
}
.variants__h .label {
  margin: 0;
}
.variants__cmp {
  font-size: var(--text-xs);
  color: var(--text-2);
}
.variants ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.variant {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 0;
  font-size: var(--text-sm);
}
.variant__name {
  flex-grow: 1;
}
.variant__meta {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.variant__actions {
  display: inline-flex;
}
.variant__bad {
  color: var(--text-3);
}
.variant__rename {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-grow: 1;
}
.variant__rename > :first-child {
  flex-grow: 1;
}
</style>
