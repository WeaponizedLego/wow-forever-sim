import type { ActionID } from '@fsim/proto/common';

/**
 * Stable string key for an engine ActionID: `spell:13555`, `item:18588`, `other:4`, with `#tag`
 * appended when the tag is non-zero (`spell:20346#-1`). The combat-log parser produces the same
 * keys, so metrics and log events join on them. `rank` is not part of the key (the log omits it).
 */
export type ActionKey = string;

export interface ParsedActionId {
  kind: 'spell' | 'item' | 'other';
  id: number;
  tag: number;
}

export function formatActionKey(a: ParsedActionId): ActionKey {
  return `${a.kind}:${a.id}${a.tag ? `#${a.tag}` : ''}`;
}

export function actionKey(id: ActionID | undefined): ActionKey {
  return formatActionKey(parseActionId(id));
}

export function parseActionId(id: ActionID | undefined): ParsedActionId {
  const raw = id?.rawId;
  const tag = id?.tag ?? 0;
  switch (raw?.oneofKind) {
    case 'spellId':
      return { kind: 'spell', id: raw.spellId, tag };
    case 'itemId':
      return { kind: 'item', id: raw.itemId, tag };
    case 'otherId':
      return { kind: 'other', id: raw.otherId, tag };
    default:
      return { kind: 'other', id: 0, tag };
  }
}

/** Parses the log form `{SpellID: 20346, Tag: -1}` / `{ItemID: 18588}` / `{OtherID: 4}`. */
export function parseLogActionId(text: string): ParsedActionId | null {
  const m = /\{(SpellID|ItemID|OtherID): (-?\d+)(?:, Tag: (-?\d+))?\}/.exec(text);
  if (!m) return null;
  const kind = m[1] === 'SpellID' ? 'spell' : m[1] === 'ItemID' ? 'item' : 'other';
  return { kind, id: Number(m[2]), tag: m[3] ? Number(m[3]) : 0 };
}
