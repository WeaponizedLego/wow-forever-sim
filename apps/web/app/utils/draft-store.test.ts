import { CharacterSchema } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import { DRAFT_VERSION, decodeDraft, encodeDraft, type SavedDraft } from './draft-store';

const character = CharacterSchema.parse({
  name: 'Testshaman',
  class: 'shaman',
  spec: 'elemental-shaman',
  race: 'orc',
  gear: { head: { itemId: 10504 } },
  talents: '',
  rotation: { kind: 'preset', presetId: 'default' },
});

const draft: SavedDraft = {
  character: { ...character, gear: { head: { itemId: 10505 } } },
  baseline: character,
  lineageId: 'lineage-a',
  baseRunId: '#0004',
  diagnostics: [{ code: 'DATA-03', severity: 'warning', message: 'Item 1 is not in this data build.' }],
};

describe('draft store', () => {
  it('round-trips the draft, its baseline, lineage and base run', () => {
    expect(decodeDraft(encodeDraft(draft))).toEqual(draft);
  });

  it('returns null for nothing, junk, another version or a draft without a lineage', () => {
    expect(decodeDraft(null)).toBeNull();
    expect(decodeDraft('')).toBeNull();
    expect(decodeDraft('{not json')).toBeNull();
    expect(
      decodeDraft(JSON.stringify({ ...JSON.parse(encodeDraft(draft)), v: DRAFT_VERSION + 1 })),
    ).toBeNull();
    expect(decodeDraft(JSON.stringify({ ...JSON.parse(encodeDraft(draft)), lineageId: '' }))).toBeNull();
    expect(
      decodeDraft(JSON.stringify({ ...JSON.parse(encodeDraft(draft)), character: { class: 'x' } })),
    ).toBeNull();
  });

  it('keeps the draft when only the baseline is unreadable, and fills schema defaults', () => {
    const stored = JSON.parse(encodeDraft(draft)) as Record<string, unknown>;
    const { level: _level, encounter: _encounter, ...older } = draft.character;
    const back = decodeDraft(JSON.stringify({ ...stored, character: older, baseline: 42, baseRunId: 7 }));
    expect(back?.character).toEqual(draft.character);
    expect(back?.baseline).toEqual(draft.character);
    expect(back?.baseRunId).toBeNull();
  });
});
