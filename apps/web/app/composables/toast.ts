// One app-wide toast (components/ui/Toast.vue, mounted by the layout): a short confirmation such as "Link copied",
// announced politely and hidden after a few seconds, or a link to copy by hand when the clipboard is not available
// (that one stays until it is closed).

export interface ToastState {
  /** Bumped on every show, so the same text twice is announced twice. */
  id: number;
  text: string;
  /** A link shown in a selectable field with a Copy button. */
  link?: string;
}

const current = shallowRef<ToastState | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const TOAST_MS = 4000;

function show(text: string) {
  clearTimeout(timer);
  current.value = { id: ++seq, text };
  timer = setTimeout(hide, TOAST_MS);
}
function showLink(link: string, text = 'Copy this share link') {
  clearTimeout(timer);
  current.value = { id: ++seq, text, link };
}
function hide() {
  clearTimeout(timer);
  current.value = null;
}

export function useToast() {
  return { current: readonly(current), show, showLink, hide };
}
