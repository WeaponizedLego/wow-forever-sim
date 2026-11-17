// Share buttons: build a /s#<payload> link (utils/share-codec.ts) and copy it. The payload lives in the
// fragment, so opening the link sends nothing to any server.
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

/** A Share button's state: call `share(payload)`; `label` reads "Link copied" for a moment afterwards. */
export function useShareButton(idle = 'Share') {
  const state = ref<'idle' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function share(payload: Omit<SharePayload, 'v'>): Promise<void> {
    clearTimeout(timer);
    try {
      const url = await shareUrl(payload);
      try {
        await navigator.clipboard.writeText(url);
        state.value = 'copied';
      } catch {
        // No clipboard permission (or not a secure context): show the link so it can be copied by hand.
        window.prompt('Copy this share link', url);
        state.value = 'idle';
        return;
      }
    } catch (e) {
      console.warn('share failed', e);
      state.value = 'failed';
    }
    timer = setTimeout(() => (state.value = 'idle'), 1500);
  }
  onBeforeUnmount(() => clearTimeout(timer));
  const label = computed(() =>
    state.value === 'copied' ? 'Link copied' : state.value === 'failed' ? 'Could not share' : idle,
  );
  return { share, label, state: readonly(state) };
}
