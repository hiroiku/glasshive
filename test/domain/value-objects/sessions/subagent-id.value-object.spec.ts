import { describe, expect, it } from 'vitest';
import {
  isSubagentFileName,
  subagentIdOf,
} from '~/domain/value-objects/sessions/subagent-id.value-object.ts';

describe('サブエージェントの `transcript` として扱うファイル名か', () => {
  it('接頭辞と拡張子の両方が揃ったものだけを通す', () => {
    expect(isSubagentFileName('agent-aimpl-foo-abcdef1234567890.jsonl')).toBe(true);
    expect(isSubagentFileName('agent-foo.txt')).toBe(false);
    expect(isSubagentFileName('11112222-3333.jsonl')).toBe(false);
  });
});

describe('サブエージェントの同一性とラベル', () => {
  it('ラベルからは接頭辞と指紋を剥がす', () => {
    expect(subagentIdOf('agent-aimpl-foo-abcdef1234567890.jsonl').label).toBe('aimpl-foo');
  });

  it('同一性からは拡張子だけを落とす', () => {
    expect(
      subagentIdOf('agent-aimpl-foo-abcdef1234567890.jsonl').id,
      '指紋まで剥がすと、名前が同じで別物の子が 1 つに見える',
    ).toBe('agent-aimpl-foo-abcdef1234567890');
  });

  it('ラベルに区切りが含まれていても、指紋だけを剥がす', () => {
    expect(subagentIdOf('agent-a-b-c-0123456789abcdef.jsonl').label).toBe('a-b-c');
  });

  it('指紋が付いていない名前はそのままラベルになる', () => {
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

  it('接頭辞が無くてもラベルは取れる', () => {
    expect(subagentIdOf('plain.jsonl')).toEqual({
      id: 'plain',
      label: 'plain',
    });
  });
});
