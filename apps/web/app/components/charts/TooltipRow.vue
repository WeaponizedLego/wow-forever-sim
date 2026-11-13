<script setup lang="ts">
// One "label … value" line in a chart tooltip. `color` draws a small identity swatch; text stays
// in text tokens.
withDefaults(defineProps<{ label: string; value: string; color?: string; dashed?: boolean }>(), {
  color: undefined,
  dashed: false,
});
</script>

<template>
  <div class="row">
    <span class="row__label">
      <span
        v-if="color"
        class="row__swatch"
        :class="{ 'row__swatch--dashed': dashed }"
        :style="dashed ? { borderColor: color } : { background: color }"
      />{{ label }}
    </span>
    <span class="num">{{ value }}</span>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--text-1);
}
.row__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.row__swatch {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-mark);
}
.row__swatch--dashed {
  height: 0;
  width: 10px;
  border-top: 1.5px dashed;
}
</style>
