<script setup lang="ts">
import { HandType, PseudoStat, WeaponSkill, WeaponType } from '@fsim/proto/common';
import { specInfo } from '~/composables/workbench';

// Caps and thresholds for the draft, only where the engine's sheet gives both sides of the comparison.
// Each meter says where its threshold comes from.
const wb = useWorkbench();

interface Meter {
  label: string;
  value: number;
  cap: number;
  max: number;
  valueText: string;
  note: string;
}
interface Plain {
  label: string;
  valueText: string;
  note: string;
}

const SKILL: Partial<Record<WeaponType, [WeaponSkill, WeaponSkill?]>> = {
  [WeaponType.WeaponTypeAxe]: [WeaponSkill.WeaponSkillAxes, WeaponSkill.WeaponSkillTwoHandedAxes],
  [WeaponType.WeaponTypeMace]: [WeaponSkill.WeaponSkillMaces, WeaponSkill.WeaponSkillTwoHandedMaces],
  [WeaponType.WeaponTypeSword]: [WeaponSkill.WeaponSkillSwords, WeaponSkill.WeaponSkillTwoHandedSwords],
  [WeaponType.WeaponTypePolearm]: [WeaponSkill.WeaponSkillPolearms],
  [WeaponType.WeaponTypeStaff]: [WeaponSkill.WeaponSkillStaves],
  [WeaponType.WeaponTypeDagger]: [WeaponSkill.WeaponSkillDaggers],
  [WeaponType.WeaponTypeFist]: [WeaponSkill.WeaponSkillFistWeapons],
};

const pct = (v: number) => `${formatNumber(v, 1)}%`;

const model = computed(() => {
  const c = wb.draft.value;
  const s = wb.draftSheet.value;
  const meters: Meter[] = [];
  const plain: Plain[] = [];
  if (!c || !s) return { meters, plain };
  const targetLevel = c.encounter.targetLevel;
  const ps = s.finalStats?.pseudoStats ?? [];
  const mc = s.meleeCritCap;

  const oh = c.gear.offHand && wb.db.value?.item(c.gear.offHand.itemId);
  const dualWield =
    !!oh &&
    oh.weaponType !== WeaponType.WeaponTypeShield &&
    oh.weaponType !== WeaponType.WeaponTypeOffHand &&
    !!oh.weaponSpeed;

  if (mc) {
    const hit = ps[PseudoStat.PseudoStatMeleeHitPercent] ?? 0;
    const cap = hit + mc.remainingHit;
    meters.push({
      label: 'Melee hit',
      value: hit,
      cap,
      max: Math.max(cap, hit) * 1.25 || 1,
      valueText: `${formatNumber(hit, 1)} / ${pct(cap)}`,
      note:
        mc.remainingHit > 0
          ? `${pct(mc.remainingHit)} miss left on white hits against a level ${targetLevel} target${
              dualWield ? ', dual-wield penalty included' : ''
            }. Cap = your hit + the miss the engine's attack table still shows.`
          : `No miss left against a level ${targetLevel} target (engine attack table); more hit adds nothing to white hits.`,
    });

    const mh = c.gear.mainHand && wb.db.value?.item(c.gear.mainHand.itemId);
    const pair = mh ? SKILL[mh.weaponType as WeaponType] : undefined;
    const skillId = pair
      ? mh!.handType === HandType.HandTypeTwoHand && pair[1]
        ? pair[1]
        : pair[0]
      : undefined;
    const skill = skillId ? s.weaponSkills.find((w) => w.skill === skillId) : undefined;
    if (skill) {
      const defense = targetLevel * 5;
      meters.push({
        label: `${WeaponSkill[skill.skill]!.replace('WeaponSkill', '').replace(/([a-z])([A-Z])/g, '$1 $2')} skill`,
        value: skill.value,
        cap: defense,
        max: defense + 10,
        valueText: `${skill.value} / ${defense}`,
        note: `Skill from the engine's sheet. The mark is the target's defense, level × 5: a game rule, not an engine value.`,
      });
    }

    const crit = mc.critCap + mc.delta;
    meters.push({
      label: 'Crit ceiling (white hits)',
      value: crit,
      cap: mc.critCap,
      max: Math.max(crit, mc.critCap) * 1.25 || 1,
      valueText: `${formatNumber(crit, 1)} / ${pct(mc.critCap)}`,
      note: `From the engine's attack table: glancing ${pct(mc.glancing)}, miss ${pct(mc.remainingHit)}, dodge and parry ${pct(mc.remainingExpertise)}, block ${pct(mc.block)}, crit suppression ${pct(mc.suppression)}. ${
        mc.delta > 0 ? `${pct(mc.delta)} of your crit is lost on white hits.` : `${pct(-mc.delta)} headroom.`
      }`,
    });
  }

  const spec = specInfo(c.spec);
  const caster = !mc && c.spec !== 'hunter';
  if (caster) {
    plain.push({
      label: 'Spell hit',
      valueText: pct(ps[PseudoStat.PseudoStatSpellHitPercent] ?? 0),
      note: "The engine's stat sheet reports no spell hit cap, so none is drawn.",
    });
  }
  if (c.spec === 'hunter') {
    plain.push({
      label: 'Ranged hit',
      valueText: pct(ps[PseudoStat.PseudoStatRangedHitPercent] ?? 0),
      note: "The engine's sheet reports a cap for main-hand white hits only; none for ranged.",
    });
  }
  if (!mc && !caster && spec.role !== 'healer' && c.spec !== 'hunter') {
    plain.push({
      label: 'Attack table',
      valueText: '—',
      note: wb.sheetsFull.value
        ? 'The engine returned no main-hand attack table (no main-hand auto attack).'
        : 'The engine could not set up the rotation, so the attack table is unavailable.',
    });
  }
  return { meters, plain };
});
</script>

<template>
  <UiPanel title="Caps &amp; thresholds" meta="draft" :span="4">
    <div v-if="wb.draftSheet.value" class="caps">
      <ChartsCapMeter v-for="m in model.meters" :key="m.label" v-bind="m" />
      <div v-for="p in model.plain" :key="p.label" class="plain">
        <div class="plain__head">
          <span>{{ p.label }}</span
          ><span class="num plain__v">{{ p.valueText }}</span>
        </div>
        <div class="plain__note">{{ p.note }}</div>
      </div>
    </div>
    <p v-else class="msg">Computing the attack table in the engine…</p>
  </UiPanel>
</template>

<style scoped>
.caps {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: 10px var(--space-4) var(--space-4);
}
.plain__head {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
}
.plain__v {
  color: var(--text-2);
}
.plain__note {
  margin-top: 5px;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.msg {
  margin: 0;
  padding: 10px var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-3);
}
</style>
