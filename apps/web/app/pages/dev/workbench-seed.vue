<script setup lang="ts">
// Dev only, until the Start screen (S1) lands: imports the real level-42 shaman SimC export and opens
// the Workbench with it. `?spec=dps-warrior` starts from that spec's preset character instead (to check
// melee caps); other query keys (`?tab=…`) are passed on.
import { SPEC_IDS, type SpecId } from '@fsim/contracts';
import { defaultCharacter } from '@fsim/gamedata';
import shamanSimc from '../../../../../fixtures/import/real/simc-shaman-lvl42.simc?raw';

const session = useSession();
const route = useRoute();
const status = ref('Importing the level-42 shaman export…');

onMounted(async () => {
  try {
    const { spec, ...query } = route.query;
    if (typeof spec === 'string' && (SPEC_IDS as string[]).includes(spec)) {
      await session.setCharacter(await defaultCharacter(spec as SpecId));
    } else {
      const r = await session.parseImport(shamanSimc);
      if (!r.character) throw new Error(r.diagnostics.map((d) => d.message).join('; ') || 'Import failed');
      await session.setCharacter(r.character, r.diagnostics);
    }
    await navigateTo({ path: '/workbench', query }, { replace: true });
  } catch (e) {
    status.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <main style="padding: 24px">
    <p class="num">{{ status }}</p>
  </main>
</template>
