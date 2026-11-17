// Fuzzy matching for the command palette (composables/commands.ts). Plain functions, no dependencies.

export interface FuzzyMatch {
  score: number;
  /** Indexes of the matched characters in the text, for highlighting. */
  positions: number[];
}

const BOUNDARY = /[\s\-_/·(.,:'#]/;
const isBoundary = (text: string, i: number) => i === 0 || BOUNDARY.test(text[i - 1]!);

/**
 * Scores `text` against `query`: every query character must appear in order (case-insensitive; spaces in
 * the query are ignored). Higher is better. A substring always beats a scattered match; contiguous runs,
 * word starts and an early first match score up; gaps and long texts score down. Null: no match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (q === '') return { score: 0, positions: [] };
  const t = text.toLowerCase();

  // Substring: prefer an occurrence at a word start.
  let at = -1;
  for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + 1)) {
    if (at < 0) at = i;
    if (isBoundary(t, i)) {
      at = i;
      break;
    }
  }
  if (at >= 0) {
    const score =
      1000 + (isBoundary(t, at) ? 200 : 0) + (at === 0 ? 100 : 0) - at - (t.length - q.length) / 4;
    return { score, positions: Array.from(q, (_, k) => at + k) };
  }
  // Scattered: first try jumping ahead to word starts ("bw" → "Bestial Wrath"), then plain left to right.
  return scattered(q, t, true) ?? scattered(q, t, false);
}

function scattered(q: string, t: string, preferWordStarts: boolean): FuzzyMatch | null {
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  for (const ch of q) {
    let j = t.indexOf(ch, from);
    if (j < 0) return null;
    if (preferWordStarts && !isBoundary(t, j)) {
      for (let k = t.indexOf(ch, j + 1); k >= 0; k = t.indexOf(ch, k + 1)) {
        if (isBoundary(t, k)) {
          j = k;
          break;
        }
      }
    }
    const prev = positions[positions.length - 1];
    score += 10;
    if (prev !== undefined && j === prev + 1) score += 15;
    if (isBoundary(t, j)) score += 20;
    score -= Math.min(j - from, 8);
    positions.push(j);
    from = j + 1;
  }
  return { score: score - t.length / 8, positions };
}

/** A keyword hit scores this much less than the same hit on the label, so "gear" finds "Top gear" first. */
const KEYWORD_PENALTY = 150;

export interface Ranked<T> {
  item: T;
  score: number;
  /** Matched positions in the label; empty when the item matched on a keyword. */
  positions: number[];
}

/**
 * Items matching the query, best first. Each item is matched on its label and on its keywords; a keyword
 * hit counts a little less than the same hit on the label.
 */
export function fuzzyRank<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => { label: string; keywords?: readonly string[] },
): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const { label, keywords = [] } = fields(item);
    const m = fuzzyMatch(query, label);
    let best: Ranked<T> | null = m ? { item, score: m.score, positions: m.positions } : null;
    for (const k of keywords) {
      const km = fuzzyMatch(query, k);
      if (km && (!best || km.score - KEYWORD_PENALTY > best.score))
        best = { item, score: km.score - KEYWORD_PENALTY, positions: [] };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}
