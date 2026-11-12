// Number formatting shared by the UI kit and charts. Every number on screen goes through here so the
// grouping, the minus sign (U+2212) and the digits stay consistent.

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const k = `${min}:${max}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(k, f);
  }
  return f;
}

export const MINUS = '−';

/** 1184.2 → "1,184.2". Negative numbers use a real minus sign. */
export function formatNumber(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  const s = nf(digits, digits).format(Math.abs(v));
  return v < 0 && s !== nf(digits, digits).format(0) ? MINUS + s : s;
}

/** 22.4 → "+22.4", −58 → "−58", 0 → "0". */
export function formatSigned(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  const s = nf(digits, digits).format(Math.abs(v));
  if (s === nf(digits, digits).format(0)) return s;
  return (v > 0 ? '+' : MINUS) + s;
}

/** 0.028 → "2.8%" (fraction in, percent out). */
export function formatPercent(fraction: number, digits = 1): string {
  return formatNumber(fraction * 100, digits) + '%';
}
