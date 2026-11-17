import { describe, expect, it } from 'vitest';
import { describeEngineError, engineErrorText } from './errors';
import { EngineError } from './pool';

const TRACE = `Stack Trace:
goroutine 7 [running]:
runtime/debug.Stack()
	/usr/local/go/src/runtime/debug/stack.go:26 +0x5e
github.com/wowsims/forever/sim/core.NewItem(...)`;

/** A request whose only player wears item 111 on the head and 226930 (enchant 999) in trinket 1. */
const req = {
  raid: {
    parties: [
      {
        players: [
          {
            equipment: {
              items: [
                { id: 111, enchant: 0 },
                ...Array.from({ length: 11 }, () => ({ id: 0, enchant: 0 })),
                { id: 226930, enchant: 999 },
              ],
            },
          },
        ],
      },
    ],
  },
};

describe('describeEngineError', () => {
  it('names the missing item and its slot, and keeps the raw text as detail', () => {
    const raw = `No item with id: 226930\n${TRACE}`;
    const info = describeEngineError(raw, req);
    expect(info.message).toMatch(/no item 226930 \(Trinket 1\)/);
    expect(info.message).not.toMatch(/goroutine|Stack Trace/);
    expect(info.detail).toBe(raw);
    expect(info.missing).toEqual({ kind: 'item', id: 226930, slot: 'Trinket 1' });
  });

  it('handles the trace on the same line, and enchants', () => {
    const info = describeEngineError(`No enchant with id: 999 Stack Trace: goroutine 7 [running]:`, req);
    expect(info.message).toMatch(/no enchant 999 \(Trinket 1\)/);
    expect(info.missing).toEqual({ kind: 'enchant', id: 999, slot: 'Trinket 1' });
  });

  it('leaves the slot out when the request does not have the id', () => {
    const info = describeEngineError('No item with id: 5');
    expect(info.message).toMatch(/no item 5,/);
    expect(info.missing).toEqual({ kind: 'item', id: 5 });
  });

  it('cuts any other panic down to its first line', () => {
    const info = describeEngineError(`runtime error: index out of range [3] with length 3\n${TRACE}`);
    expect(info.message).toBe('runtime error: index out of range [3] with length 3');
    expect(info.detail).toMatch(/^Stack Trace:/);
  });

  it('passes a plain one-line message through', () => {
    expect(describeEngineError('simOptions.iterations must be at least 1.')).toEqual({
      message: 'simOptions.iterations must be at least 1.',
      detail: null,
    });
  });

  it('round-trips through engineErrorText without losing the slot or the trace', () => {
    const e = new EngineError(`No item with id: 226930\n${TRACE}`, req);
    expect(e.name).toBe('EngineError');
    expect(e.message).toMatch(/Trinket 1/);
    const text = engineErrorText(e);
    const again = describeEngineError(text);
    expect(again.message).toBe(e.message);
    expect(again.detail).toContain('goroutine 7');
    expect(again.detail).toContain('No item with id: 226930');
  });

  it('engineErrorText falls back to the message or the value', () => {
    expect(engineErrorText(new Error('plain'))).toBe('plain');
    expect(engineErrorText('text')).toBe('text');
  });
});
