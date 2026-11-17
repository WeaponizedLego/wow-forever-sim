// Share buttons: build a /s#<payload> link (utils/share-codec.ts) and copy it. The payload lives in the
// fragment, so opening the link sends nothing to any server. Every way of sharing (the run page's Share, the
// Workbench's Share draft, the palette's "Copy share link") confirms with a toast (useToast): "Link copied", or,
// when the clipboard is not available, the link itself in a field with a Copy button.
import type { RunRecord } from '@fsim/contracts';
import { encodeShare, type SharePayload } from '~/utils/share-codec';

/** The share payload that reproduces a finished run. */
export function sharePayloadForRun(r: RunRecord): Omit<SharePayload, 'v'> {
  return {
    character: r.character,
    iterations: r.iterations,
    seed: r.seed,
    engineId: r.engine.engineId,
    kind: r.kind,
  };
}

export async function shareUrl(payload: Omit<SharePayload, 'v'>): Promise<string> {
  const base = new URL(useRuntimeConfig().app.baseURL, window.location.origin);
  return `${new URL('s', base).href}#${await encodeShare(payload)}`;
}

/**
 * Builds the link and copies it, with the confirmation toast. 'manual': the clipboard refused, and the toast shows
 * the link to copy by hand. 'failed': no link could be made.
 */
export async function copyShareLink(
  payload: Omit<SharePayload, 'v'>,
): Promise<'copied' | 'manual' | 'failed'> {
  const toast = useToast();
  let url: string;
  try {
    url = await shareUrl(payload);
  } catch (e) {
    console.warn('share failed', e);
    toast.show('Could not make a share link');
    return 'failed';
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // No clipboard permission (or not a secure context): show the link so it can be copied by hand.
    toast.showLink(url);
    return 'manual';
  }
  toast.show('Link copied');
  return 'copied';
}

/** A Share button's state: call `share(payload)`; `label` reads "Link copied" for a moment afterwards. */
export function useShareButton(idle = 'Share') {
  const state = ref<'idle' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function share(payload: Omit<SharePayload, 'v'>): Promise<void> {
    clearTimeout(timer);
    const result = await copyShareLink(payload);
    state.value = result === 'manual' ? 'idle' : result;
    if (result !== 'manual') timer = setTimeout(() => (state.value = 'idle'), 2500);
  }
  onBeforeUnmount(() => clearTimeout(timer));
  const label = computed(() =>
    state.value === 'copied' ? 'Link copied' : state.value === 'failed' ? 'Could not share' : idle,
  );
  return { share, label, state: readonly(state) };
}
