// Command palette (⌘K): open state and the command registry. Matching is in utils/fuzzy.ts.
//
// The palette itself (components/palette/CommandPalette.vue) loads on first open, so this file stays small:
// the layout imports it on every page. Pages and components add contextual commands with
// `useCommandSource(() => [...])`; they are listed while that component is mounted. A registered command
// with the same id as one of the palette's built-in commands replaces it: the Workbench sim bar registers
// "sim.run", so from the Workbench the palette sims with the bar's iterations and stat-weights setting.

export interface Command {
  /** Stable id; a registered command replaces a built-in one with the same id. */
  id: string;
  /** Section the command is listed under, e.g. "Actions". */
  section: string;
  label: string;
  /** Secondary text after the label (a path, a DPS figure, a slot). */
  detail?: string;
  /** Other words the command is found by. */
  keywords?: readonly string[];
  /** Shortcut hint, e.g. "⌘↵". */
  kbd?: string;
  /** Why it cannot run now: the command is listed but cannot be chosen. */
  disabled?: string | null;
  /** Listed before anything is typed (default: only as a search result). */
  suggested?: boolean;
  /**
   * The palette closes before `run` (it usually navigates). With `feedback`, it stays open while `run` works
   * and shows the text `run` returns ("Link copied") for a moment before closing.
   */
  feedback?: boolean;
  run: () => unknown;
}

type Source = () => readonly Command[];

const sources = shallowRef<ReadonlyMap<symbol, Source>>(new Map());

/** Lists the source's commands in the palette while the calling component is mounted. */
export function useCommandSource(source: Source): void {
  const key = Symbol('commands');
  onMounted(() => {
    sources.value = new Map(sources.value).set(key, source);
  });
  onBeforeUnmount(() => {
    const next = new Map(sources.value);
    next.delete(key);
    sources.value = next;
  });
}

/** Every registered command; for a repeated id, the latest registration. Reactive inside a computed. */
export function registeredCommands(): Command[] {
  const byId = new Map<string, Command>();
  for (const source of [...sources.value.values()].reverse())
    for (const c of source()) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()];
}

const open = ref(false);
let returnFocus: HTMLElement | null = null;

/** Palette visibility. `show()` remembers what had focus; `hide()` gives focus back to it. */
export function usePalette() {
  function show() {
    if (open.value) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open.value = true;
  }
  function hide() {
    if (!open.value) return;
    open.value = false;
    const el = returnFocus;
    returnFocus = null;
    void nextTick(() => {
      if (el?.isConnected) el.focus();
    });
  }
  return { open: readonly(open), show, hide, toggle: () => (open.value ? hide() : show()) };
}
