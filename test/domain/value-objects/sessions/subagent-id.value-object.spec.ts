import { describe, expect, it } from 'vitest';
import {
  isSubagentFileName,
  subagentIdOf,
} from '~/domain/value-objects/sessions/subagent-id.value-object.ts';

describe('子の正本として扱う名前か', () => {
  it('前置きと拡張子の両方が揃ったものだけを通す', () => {
    expect(isSubagentFileName('agent-aimpl-foo-abcdef1234567890.jsonl')).toBe(true);
    expect(isSubagentFileName('agent-foo.txt')).toBe(false);
    expect(isSubagentFileName('11112222-3333.jsonl')).toBe(false);
  });
});

describe('子の同一性と呼び名', () => {
  it('呼び名からは前置きと指紋を剥がす', () => {
    expect(subagentIdOf('agent-aimpl-foo-abcdef1234567890.jsonl').label).toBe('aimpl-foo');
  });

  it('同一性からは拡張子だけを落とす', () => {
    expect(
      subagentIdOf('agent-aimpl-foo-abcdef1234567890.jsonl').id,
      '指紋まで剥がすと、名前が同じで別物の子が 1 つに見える',
    ).toBe('agent-aimpl-foo-abcdef1234567890');
  });

  it('呼び名に区切りが含まれていても、指紋だけを剥がす', () => {
    expect(subagentIdOf('agent-a-b-c-0123456789abcdef.jsonl').label).toBe('a-b-c');
  });

  it('指紋が付いていない名前はそのまま呼び名になる', () => {
    expect(subagentIdOf('agent-plain.jsonl').label).toBe('plain');
  });

  it('16 桁でない末尾は指紋と見なさない', () => {
    expect(subagentIdOf('agent-foo-abcdef123456789.jsonl').label).toBe('foo-abcdef123456789');
    expect(subagentIdOf('agent-foo-abcdef12345678901.jsonl').label).toBe('foo-abcdef12345678901');
  });

  it('16 桁でも十六進でない末尾は指紋と見なさない', () => {
    expect(subagentIdOf('agent-foo-ABCDEF1234567890.jsonl').label).toBe('foo-ABCDEF1234567890');
    expect(subagentIdOf('agent-foo-zzzzzzzzzzzzzzzz.jsonl').label).toBe('foo-zzzzzzzzzzzzzzzz');
  });

  it('前置きが無くても呼び名は取れる', () => {
    expect(subagentIdOf('plain.jsonl')).toEqual({
      id: 'plain',
      label: 'plain',
    });
  });
});
