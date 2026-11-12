<script setup lang="ts">
// Phase 0 placeholder. The real Start screen is lane S1 (docs/plan.md §3).
import { SPECS } from '@fsim/contracts';

const classes = [...new Set(SPECS.map((s) => s.class))];
</script>

<template>
  <header class="chrome">
    <div class="chrome__inner">
      <span class="num wordmark">forever<span class="wordmark__slash">/</span>sim</span>
      <span class="num status"><span class="status__dot" aria-hidden="true" />scaffold · phase 0</span>
    </div>
  </header>
  <main class="page">
    <h1 class="title">New run</h1>
    <section class="panel" aria-labelledby="specs-h">
      <div class="panel__head">
        <h2 id="specs-h">Specs known to the contracts package</h2>
        <span class="num meta">{{ SPECS.length }} specs · {{ classes.length }} classes</span>
      </div>
      <ul class="specs">
        <li v-for="s in SPECS" :key="s.id">
          <span class="specs__mark" :style="{ background: `var(--class-${s.class})` }" aria-hidden="true" />
          {{ s.name }}
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.chrome {
  height: var(--chrome-height);
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--line-seam);
}
.chrome__inner {
  max-width: var(--page-max);
  height: 100%;
  margin: 0 auto;
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wordmark {
  font-size: var(--text-sm);
  font-weight: 500;
}
.wordmark__slash {
  color: var(--text-3);
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-2);
}
.status__dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--status-warning);
}
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 20px var(--space-6) 40px;
}
.title {
  margin: 0 0 var(--space-5);
  font-size: var(--text-lg);
  font-weight: 600;
}
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--line-seam);
}
.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--line-seam);
}
.panel__head h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 500;
}
.meta {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.specs {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-4);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px var(--space-6);
}
.specs li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.specs__mark {
  width: 3px;
  height: 12px;
  border-radius: var(--radius-mark);
}
</style>
