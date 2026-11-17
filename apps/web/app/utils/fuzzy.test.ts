import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyRank } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches characters in order, ignoring case and spaces in the query', () => {
    expect(fuzzyMatch('wb', 'Workbench')?.positions).toEqual([0, 4]);
    expect(fuzzyMatch('top g', 'Top gear')?.positions).toEqual([0, 1, 2, 4]);
    expect(fuzzyMatch('xyz', 'Workbench')).toBeNull();
    expect(fuzzyMatch('ba', 'ab')).toBeNull();
  });

  it('scores a substring above a scattered match, and a word start above the middle of a word', () => {
    const sub = fuzzyMatch('gear', 'Top gear')!.score;
    const scattered = fuzzyMatch('gear', 'Go eat a radish')!.score;
    expect(sub).toBeGreaterThan(scattered);
    expect(fuzzyMatch('run', 'Run sim')!.score).toBeGreaterThan(fuzzyMatch('run', 'Rerun sim')!.score);
  });

  it('jumps to word starts for initials', () => {
    expect(fuzzyMatch('bw', 'Bestial Wrath')?.positions).toEqual([0, 8]);
    expect(fuzzyMatch('ns', 'New stat weights run')?.positions).toEqual([0, 4]);
  });

  it('falls back to a plain left-to-right match when the word-start jump would fail', () => {
    // Jumping to the "a" of "and" leaves no "n" after it in word-start mode only if we never fall back.
    expect(fuzzyMatch('ann', 'banana and')).not.toBeNull();
  });

  it('an empty query matches everything with score 0', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, positions: [] });
  });
});

describe('fuzzyRank', () => {
  const items = [
    { label: 'Workbench', keywords: ['edit', 'gear'] },
    { label: 'Top gear', keywords: [] },
    { label: 'New run', keywords: ['import', 'paste'] },
  ];
  const rank = (q: string) => fuzzyRank(q, items, (i) => i).map((r) => r.item.label);

  it('orders by score and drops non-matches', () => {
    expect(rank('gear')).toEqual(['Top gear', 'Workbench']);
    expect(rank('paste')).toEqual(['New run']);
    expect(rank('zzz')).toEqual([]);
  });

  it('keyword hits carry no label highlight', () => {
    expect(fuzzyRank('import', items, (i) => i)[0]).toMatchObject({ positions: [] });
  });
});
