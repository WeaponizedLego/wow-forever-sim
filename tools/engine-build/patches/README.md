# Engine patches

Go files we add to the upstream [wowsims/forever](https://github.com/wowsims/forever) engine before building it.
`apply.mjs` copies them into the checkout; both builds use it:

- `tools/engine-build/build.mjs` (release builds, the hourly engine sync) applies them to its clone after the
  clone is reset, so they are in every release from the next sync on;
- `packages/engine/scripts/build-local.mjs` (dev and tests) copies them into your checkout for the build and
  removes them afterwards.

Each file is stored as `.go.txt` so nothing in this repo treats it as Go. Keep patches small: the hourly sync
rebuilds upstream's newest commit with them.

## `fsim_slice_mob.go.txt` → `sim/core/zz_fsim_slice_mob.go`

The dungeon slice fight style (`packages/contracts/src/fight-styles.ts`). Upstream's `DynamicAddsAI` spawns and
despawns every add together on one repeating cycle, with target 0 always up, so it cannot express several packs
of different sizes with a boss in between. This patch registers a preset target, the "slice mob"
(`Target.id` 2000000101, `SLICE_MOB_ID` in `packages/gamedata/src/fights.ts`), whose AI:

- reads its window from its own target inputs: `[0]` spawn at (s), `[1]` despawn at (s), `[2]` kill share %;
- is disabled until the spawn (`Enable`, then the raid's debuffs land as on upstream's adds), and dies at the
  despawn (`Die`, so on-kill effects run);
- moves its execute phases (35/25/20% health) into its own life, so each pack reaches execute range at the end
  of its pull. That is the one reason it lives in package `core`: the execute times are unexported;
- implements `TargetSchedule`, so the APL's target spawn and death values see the windows.

A request lists every mob of the slice with its window; the request builder does that from the style's
segments. Verified by `packages/engine/src/fight-styles.test.ts` against a local build (spawns and deaths at
the scheduled times, no damage outside a mob's window, AoE across a pack, Execute only in each mob's last 20%)
and by upstream's own `go test -tags with_db ./sim/core/ ./sim/encounters/` with the patch in place.

An engine built without the patch (any release before it) treats the slice mob as a plain target: mobs that
are disabled at start never appear. `sliceRanAsScheduled()` notices that from the result, and the run header
says the fight did not run as scheduled.

## When upstream changes

`apply.mjs` lists the upstream code each patch relies on ("anchors"). If one is gone, the build stops with

```
engine patch fsim_slice_mob: upstream no longer has `<anchor>` in <file>. Update tools/engine-build/patches/…
```

and the engine sync opens its usual failure issue. Read upstream's change, update the `.go.txt` and the
anchors, and rebuild with `node packages/engine/scripts/build-local.mjs --src <checkout>` plus
`pnpm exec vitest run packages/engine/src/fight-styles.test.ts`. A compile error in the patch after an upstream
change is the same situation without the friendly message.
