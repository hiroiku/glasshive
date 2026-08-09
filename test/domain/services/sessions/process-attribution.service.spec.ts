import { describe, expect, it } from 'vitest';
import { attributeProcesses } from '~/domain/services/sessions/process-attribution.service.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';

const proc = (pid: number, cwd: string): AgentProcess => ({ pid, cwd });

describe('生きている道具を巣へ割り振る', () => {
  it('返す並びは巣と同じ順・同じ長さ', () => {
    const counts = attributeProcesses(['/a', '/b', '/c'], [proc(1, '/b')]);
    expect(counts, '呼ぶ側は添字で巣と突き合わせるので、長さがずれると意味が壊れる').toEqual([
      0, 1, 0,
    ]);
  });

  it('入れ子の巣では、深い方だけに数える', () => {
    const counts = attributeProcesses(['/a/b', '/a/b/c'], [proc(1, '/a/b/c/x')]);
    expect(counts, '浅い方にも数えると、home の 1 つが配下を残らず生きているように見せる').toEqual([
      0, 1,
    ]);
  });

  it('深い方が先に並んでいても、選び方は変わらない', () => {
    const counts = attributeProcesses(['/a/b/c', '/a/b'], [proc(1, '/a/b/c/x')]);
    expect(counts, '帰属は並び順ではなく深さで決まる').toEqual([1, 0]);
  });

  it('名前の頭が同じだけの隣を取り違えない', () => {
    const counts = attributeProcesses(['/a/b', '/a/bc'], [proc(1, '/a/bc/x')]);
    expect(counts, '前方一致だけで見ると、隣の巣の道具がこちらのものになる').toEqual([0, 1]);
  });

  it('作業場所がそのまま巣のときも数える', () => {
    const counts = attributeProcesses(['/a/b'], [proc(1, '/a/b')]);
    expect(counts).toEqual([1]);
  });

  it('どこにも含まれない道具は、どこにも数えない', () => {
    const counts = attributeProcesses(['/a/b', '/a/c'], [proc(1, '/x/y')]);
    expect(counts, '当てずっぽうで割り振るより、数えないほうが嘘が少ない').toEqual([0, 0]);
  });

  it('場所の分からない巣には数えない', () => {
    const counts = attributeProcesses([null, '/a/b'], [proc(1, '/a/b/x')]);
    expect(counts, '場所が無ければ含むかを測れない').toEqual([0, 1]);
  });

  it('同じ深さで並んだときは、先に見つけたものが残る', () => {
    const counts = attributeProcesses(['/a/b', '/a/b/'], [proc(1, '/a/b/x')]);
    expect(counts, '選び直す理由が無いので、先のものを保つ').toEqual([1, 0]);
  });

  it('道具が複数あれば、それぞれ 1 つずつ数える', () => {
    const counts = attributeProcesses(
      ['/a', '/a/b'],
      [proc(1, '/a/x'), proc(2, '/a/b/y'), proc(3, '/a/b')],
    );
    expect(counts).toEqual([1, 2]);
  });

  it('道具が 1 つも無ければ、どの巣も 0', () => {
    expect(attributeProcesses(['/a', '/b'], [])).toEqual([0, 0]);
  });

  it('巣が 1 つも無ければ、空の並びを返す', () => {
    expect(attributeProcesses([], [proc(1, '/a')])).toEqual([]);
  });

  it('遡る道は畳んでから見る', () => {
    const counts = attributeProcesses(['/a/b'], [proc(1, '/a/b/../c')]);
    expect(counts, '字面だけで見ると、巣の外にいる道具を中にいると数えてしまう').toEqual([0]);
  });

  it('深さも畳んでから測る', () => {
    // 遡る道を含む字面は長いが、指している場所は浅い
    const counts = attributeProcesses(['/a/b/c', '/a/x/../b'], [proc(1, '/a/b/c/d')]);
    expect(counts, '字面の長さで測ると、本当は浅い巣が深い巣から道具を奪う').toEqual([1, 0]);
  });

  it('深さ 0 の巣も、他に当てが無ければ受け取る', () => {
    const counts = attributeProcesses(['/', '/x'], [proc(1, '/a/b')]);
    expect(counts, '深さ 0 を「見つからなかった」と取り違えない').toEqual([1, 0]);
  });

  it('深さ 0 の巣は、当てが有れば譲る', () => {
    const counts = attributeProcesses(['/', '/a/b'], [proc(1, '/a/b/c')]);
    expect(counts, '根に数えると、配下の巣が残らず生きているように見える').toEqual([0, 1]);
  });
});
