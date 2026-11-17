// Our engine patches: Go files copied into an upstream wowsims/forever checkout before `go build`.
// Used by tools/engine-build/build.mjs (release builds) and packages/engine/scripts/build-local.mjs (dev).
//
// Each patch names the upstream code it relies on ("anchors"). If upstream drops or renames one, applying fails
// with a message naming it, instead of the build breaking later or, worse, the patch silently changing meaning.
// See README.md in this folder.
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const PATCHES = [
  {
    name: 'fsim_slice_mob',
    source: 'fsim_slice_mob.go.txt',
    dest: 'sim/core/zz_fsim_slice_mob.go',
    anchors: [
      ['sim/core/target_ai.go', 'type TargetSchedule interface'],
      ['sim/core/target_ai.go', 'func AddPresetTarget(newPreset *PresetTarget)'],
      ['sim/core/target.go', 'Schedule TargetSchedule'],
      ['sim/core/target.go', 'executeAt35 time.Duration'],
      ['sim/core/target.go', 'executeAt25 time.Duration'],
      ['sim/core/target.go', 'executeAt20 time.Duration'],
      ['sim/core/target.go', 'func (target *Target) Disable(sim *Simulation, expireAuras bool)'],
      ['sim/core/target.go', 'func (encounter *Encounter) addActiveTarget(target *Target)'],
      ['sim/core/target_health.go', 'func (encounter *Encounter) updateNextExecuteDuration(sim *Simulation)'],
      ['sim/core/target_death.go', 'func (target *Target) Die(sim *Simulation, killShare float64)'],
      ['sim/core/target_raid_debuffs.go', 'func (encounter *Encounter) ScheduleAddRaidDebuffs('],
      ['sim/core/target_raid_debuffs.go', 'func (target *Target) DisableRaidDebuffs(sim *Simulation)'],
    ],
  },
];

/**
 * Copies every patch into `src` (an upstream checkout). Throws, naming the patch and the anchor, when upstream
 * no longer has code a patch relies on. Returns the paths it wrote, so a caller working on someone's own
 * checkout can remove them again.
 */
export function applyEnginePatches(src, log = console.log) {
  const written = [];
  for (const p of PATCHES) {
    for (const [file, anchor] of p.anchors) {
      const path = join(src, file);
      if (!existsSync(path) || !readFileSync(path, 'utf8').includes(anchor)) {
        throw new Error(
          `engine patch ${p.name}: upstream no longer has \`${anchor}\` in ${file}. ` +
            `Update tools/engine-build/patches/${p.source} and its anchors in apply.mjs (see patches/README.md).`,
        );
      }
    }
    const dest = join(src, p.dest);
    copyFileSync(join(HERE, p.source), dest);
    written.push(dest);
    log(`engine patch ${p.name} → ${p.dest}`);
  }
  return written;
}

export function removeEnginePatches(paths) {
  for (const p of paths) rmSync(p, { force: true });
}
