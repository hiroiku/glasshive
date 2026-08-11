import { describe, expect, it } from 'vitest';
import { isClosedStatus, withoutClosed } from '~/frameworks/tanstack/ui/derive/issueStatus.ts';

/** 課題の形は絞り込みそのものから引く。書き写すと、形が変わってもテストが気づけない */
type IssueSummaryJson = Parameters<typeof withoutClosed>[0][number];

/* GitHub の課題は 1 回で全部を取ってきて、一覧に出すぶんだけをここで絞る。

   **絞る決まりは `buildLedger` と同じでなければならない。** `counts` を数えるのは
   `buildLedger` の側なので、こちらが違う集合を持つと、一覧から消えた課題が件数にだけ
   残る、という食い違いになる。 */

const issue = (id: string, status: string): IssueSummaryJson => ({
  id,
  title: id,
  status,
  issue_type: null,
  labels: [],
  assignee: null,
  created_at: null,
  updated_at: null,
  deps: [],
  deps_complete: true,
  github: {
    url: null,
    labels: [],
    assignees: [],
    author: null,
    milestone: null,
    issue_type_color: null,
    sub_issues: null,
    pull_requests: [],
    comments: 0,
    reactions: 0,
  },
});

describe('閉じた課題の見分け', () => {
  it('closed と not_planned を済んだものとして扱う', () => {
    expect(isClosedStatus('closed')).toBe(true);
    expect(isClosedStatus('not_planned'), '「やらないことにした」も、開いたままではない').toBe(
      true,
    );
  });

  it('開いているものと塞がっているものは落とさない', () => {
    expect(isClosedStatus('open')).toBe(false);
    expect(isClosedStatus('blocked'), '塞がっているのは、済んだのではない').toBe(false);
    expect(isClosedStatus('その他'), 'GitHub が付けた見知らぬ状態も、済んだとは言えない').toBe(
      false,
    );
  });
});

describe('閉じたものを含めない一覧', () => {
  it('closed と not_planned だけを落とす', () => {
    const all = [
      issue('#1', 'open'),
      issue('#2', 'closed'),
      issue('#3', 'blocked'),
      issue('#4', 'not_planned'),
    ];

    expect(withoutClosed(all).map((found) => found.id)).toEqual(['#1', '#3']);
  });

  it('渡された順を変えない', () => {
    const all = [issue('#9', 'open'), issue('#1', 'open')];

    expect(
      withoutClosed(all).map((found) => found.id),
      '並べ替えは別の場所の仕事で、ここが順を触ると二重に並べ替わる',
    ).toEqual(['#9', '#1']);
  });

  it('落とすものが無ければ、全部そのまま返す', () => {
    const all = [issue('#1', 'open'), issue('#2', 'blocked')];

    expect(withoutClosed(all)).toHaveLength(2);
  });
});
