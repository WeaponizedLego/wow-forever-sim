// The droptimizer's boss chips: "All" plus one chip per boss. Pure, so unit-tested.
//
// The selection is `null` for "All" (every boss, now and when the list is the whole instance), else the keys
// picked. With "All" active the boss chips show unpressed, and clicking one isolates it: "I want this boss"
// is the common intent, not "everything but this boss". After that, clicks add or remove bosses, and picking
// every boss (or clicking "All") goes back to `null`.

export type BossSelection = readonly string[] | null;

/** The selection after clicking boss `key`, given every boss key of the instance in order. */
export function toggleBoss(selected: BossSelection, all: readonly string[], key: string): BossSelection {
  let next: string[];
  if (selected === null) next = [key];
  else if (selected.includes(key)) next = selected.filter((k) => k !== key);
  else next = all.filter((k) => k === key || selected.includes(k));
  return next.length === all.length && all.every((k) => next.includes(k)) ? null : next;
}

/** Whether boss `key`'s chip shows pressed: only when picked on its own, not under "All". */
export const bossPressed = (selected: BossSelection, key: string): boolean =>
  selected !== null && selected.includes(key);

/** The keys a selection sims. */
export const selectedBosses = (selected: BossSelection, all: readonly string[]): readonly string[] =>
  selected ?? all;
