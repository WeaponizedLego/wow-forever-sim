// Helpers for the hand-written SVG charts in components/charts.
import type { Ref } from 'vue';

/**
 * Width of an element in CSS px, kept current with a ResizeObserver. Charts draw in a viewBox that
 * equals their pixel size, so 2px gaps, rounded ends and dots stay true at every width.
 */
export function useChartWidth(el: Ref<HTMLElement | null>, fallback = 600): Ref<number> {
  const width = ref(fallback);
  let ro: ResizeObserver | undefined;
  onMounted(() => {
    const node = el.value;
    if (!node) return;
    width.value = node.clientWidth || fallback;
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) width.value = Math.max(1, Math.round(w));
    });
    ro.observe(node);
  });
  onBeforeUnmount(() => ro?.disconnect());
  return width;
}

/**
 * The "active" mark of a chart: set by pointer hover and by the keyboard when the plot has focus
 * (←/→ or ↑/↓ step, Home/End jump, Esc clears). Focus shows the first mark so the tooltip appears
 * on focus too.
 */
export function useChartCursor(count: () => number) {
  const active = ref<number | null>(null);
  function onKeydown(e: KeyboardEvent) {
    const n = count();
    if (!n) return;
    const cur = active.value ?? -1;
    let next: number | null = cur;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = Math.min(n - 1, cur + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = Math.max(0, cur - 1);
        break;
      case 'PageUp':
        next = Math.max(0, cur - 10);
        break;
      case 'PageDown':
        next = Math.min(n - 1, cur + 10);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      case 'Escape':
        next = null;
        break;
      default:
        return;
    }
    e.preventDefault();
    active.value = next;
  }
  function onFocus() {
    if (active.value === null && count() > 0) active.value = 0;
  }
  function onBlur() {
    active.value = null;
  }
  return { active, onKeydown, onFocus, onBlur };
}

/** Linear scale from a domain to a range. */
export function linearScale(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Log scale (base irrelevant) from a positive domain to a range. */
export function logScale(d0: number, d1: number, r0: number, r1: number) {
  const l0 = Math.log(d0);
  const l1 = Math.log(d1);
  const k = l1 === l0 ? 0 : (r1 - r0) / (l1 - l0);
  return (v: number) => r0 + (Math.log(Math.max(v, Number.MIN_VALUE)) - l0) * k;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Position as a CSS percentage string, clamped to the box. */
export const pct = (fraction: number) => `${(clamp(fraction, 0, 1) * 100).toFixed(3)}%`;

/** Index of the item whose x is nearest to px (xs sorted ascending). */
export function nearestIndex(xs: number[], px: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] ?? 0) < px) lo = mid;
    else hi = mid;
  }
  return Math.abs((xs[lo] ?? 0) - px) <= Math.abs((xs[hi] ?? 0) - px) ? lo : hi;
}
