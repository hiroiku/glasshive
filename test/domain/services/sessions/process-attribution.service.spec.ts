import { describe, expect, it } from 'vitest';
import { attributeProcesses } from '~/domain/services/sessions/process-attribution.service.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';

const proc = (pid: number, cwd: string): AgentProcess => ({ pid, cwd });

describe('生きているプロセスをプロジェクトへ割り振る', () => {
  it('返す配列はプロジェクトと同じ順・同じ長さ', () => {
    const counts = attributeProcesses(['/a', '/b', '/c'], [proc(1, '/b')]);
    expect(
      counts,
      '呼ぶ側は添字でプロジェクトと突き合わせるので、長さがずれると意味が壊れる',
    ).toEqual([0, 1, 0]);
  });

  it('入れ子のプロジェクトでは、深い方だけに数える', () => {
    const counts = attributeProcesses(['/a/b', '/a/b/c'], [proc(1, '/a/b/c/x')]);
    expect(
      counts,
      '浅い方にも数えると、`~` のプロジェクトが配下を残らず生きているように見せる',
    ).toEqual([0, 1]);
  });

  it('深い方が先に並んでいても、選び方は変わらない', () => {
    const counts = attributeProcesses(['/a/b/c', '/a/b'], [proc(1, '/a/b/c/x')]);
    expect(counts, '帰属は並び順ではなく深さで決まる').toEqual([1, 0]);
  });

  it('名前の頭が同じだけの隣を取り違えない', () => {
    const counts = attributeProcesses(['/a/b', '/a/bc'], [proc(1, '/a/bc/x')]);
    expect(counts, '前方一致だけで見ると、隣のプロジェクトのプロセスがこちらのものになる').toEqual([
      0, 1,
    ]);
  });

  it('作業ディレクトリがそのままプロジェクトのときも数える', () => {
    const counts = attributeProcesses(['/a/b'], [proc(1, '/a/b')]);
    expect(counts).toEqual([1]);
  });

  it('worktree の中で働くプロセスは、worktree のプロジェクトに数える', () => {
    const counts = attributeProcesses(
      ['/a/b', '/a/b/.worktrees/x'],
      [proc(1, '/a/b/.worktrees/x/src')],
    );
    expect(counts, 'worktree は元のリポジトリの中にあるので、深い方が受け取る').toEqual([0, 1]);
  });

  it('プロジェクトの外側で働くプロセスは、その中のプロジェクトに数えない', () => {
    const counts = attributeProcesses(['/a/b/.worktrees/x'], [proc(1, '/a/b')]);
    expect(
      counts,
      '向きを問わずに重なりだけで見ると、`~` の 1 つのプロセスが配下を残らず生きているように見せる',
    ).toEqual([0]);
  });

  it('どこにも含まれないプロセスは、どこにも数えない', () => {
    const counts = attributeProcesses(['/a/b', '/a/c'], [proc(1, '/x/y')]);
    expect(counts, '当てずっぽうで割り振るより、数えないほうが嘘が少ない').toEqual([0, 0]);
  });

  it('パスの分からないプロジェクトには数えない', () => {
    const counts = attributeProcesses([null, '/a/b'], [proc(1, '/a/b/x')]);
    expect(counts, 'パスが無ければ含むかを測れない').toEqual([0, 1]);
  });

  it('同じ深さで並んだときは、先に見つけたものが残る', () => {
    const counts = attributeProcesses(['/a/b', '/a/b/'], [proc(1, '/a/b/x')]);
    expect(counts, '選び直す理由が無いので、先のものを保つ').toEqual([1, 0]);
  });

  it('プロセスが複数あれば、それぞれ 1 つずつ数える', () => {
    const counts = attributeProcesses(
      ['/a', '/a/b'],
      [proc(1, '/a/x'), proc(2, '/a/b/y'), proc(3, '/a/b')],
    );
    expect(counts).toEqual([1, 2]);
  });

  it('プロセスが 1 つも無ければ、どのプロジェクトも 0', () => {
    expect(attributeProcesses(['/a', '/b'], [])).toEqual([0, 0]);
  });

  it('プロジェクトが 1 つも無ければ、空の配列を返す', () => {
    expect(attributeProcesses([], [proc(1, '/a')])).toEqual([]);
  });

  it('`..` を含むパスは、正規化してから見る', () => {
    const counts = attributeProcesses(['/a/b'], [proc(1, '/a/b/../c')]);
    expect(
      counts,
      '表記だけで見ると、プロジェクトの外にいるプロセスを中にいると数えてしまう',
    ).toEqual([0]);
  });

  it('深さも正規化してから測る', () => {
    // `..` を含むパスは表記が長いが、指しているパスは浅い
    const counts = attributeProcesses(['/a/b/c', '/a/x/../b'], [proc(1, '/a/b/c/d')]);
    expect(
      counts,
      '表記の長さで測ると、本当は浅いプロジェクトが深いプロジェクトからプロセスを奪う',
    ).toEqual([1, 0]);
  });

  it('深さ 0 のプロジェクトも、他に候補が無ければ受け取る', () => {
    const counts = attributeProcesses(['/', '/x'], [proc(1, '/a/b')]);
    expect(counts, '深さ 0 を「見つからなかった」と取り違えない').toEqual([1, 0]);
  });

  it('深さ 0 のプロジェクトは、候補が有れば譲る', () => {
    const counts = attributeProcesses(['/', '/a/b'], [proc(1, '/a/b/c')]);
    expect(counts, '根に数えると、配下のプロジェクトが残らず生きているように見える').toEqual([
      0, 1,
    ]);
  });
});
