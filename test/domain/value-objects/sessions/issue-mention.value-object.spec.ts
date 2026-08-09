import { describe, expect, it } from 'vitest';
import {
  MAX_MENTIONS,
  scanWorktreeMentions,
} from '~/domain/value-objects/sessions/issue-mention.value-object.ts';

describe('作業場所の名前から課題を拾う', () => {
  it('出てきた順に拾う', () => {
    expect(scanWorktreeMentions('cd .worktrees/foo-123 && ls .worktrees/bar-9')).toEqual([
      'foo-123',
      'bar-9',
    ]);
  });

  it('同じ名前は一度だけ数える', () => {
    expect(scanWorktreeMentions('.worktrees/foo .worktrees/foo .worktrees/foo')).toEqual(['foo']);
  });

  it('末尾の点は区切りとして落とす', () => {
    expect(scanWorktreeMentions('置き場は .worktrees/foo-123. である')).toEqual(['foo-123']);
  });

  it('点だけの名前は課題にならない', () => {
    expect(scanWorktreeMentions('.worktrees/...')).toEqual([]);
  });

  it('名前に使えない字で切れる', () => {
    expect(scanWorktreeMentions('.worktrees/foo-123/src/main.ts')).toEqual(['foo-123']);
  });

  it('上限で打ち切る', () => {
    const text = Array.from({ length: 20 }, (_, i) => `.worktrees/x${i}`).join(' ');
    expect(scanWorktreeMentions(text)).toHaveLength(MAX_MENTIONS);
    expect(scanWorktreeMentions(text, 3)).toEqual(['x0', 'x1', 'x2']);
  });

  it('一つも出てこなければ空', () => {
    expect(scanWorktreeMentions('worktrees/foo')).toEqual([]);
    expect(scanWorktreeMentions('')).toEqual([]);
  });
});
