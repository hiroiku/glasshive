import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { presentIssue, presentIssues } from '~/interface/presenters/issues/issues.presenter.ts';

/* 写す側は名札しか見ない。誤りの型を持ち込まずに、名札だけを与えて確かめる。 */
class LedgerUnreadable extends AppError {
  readonly code = 'ledger.unreadable';
}

const LEDGER = {
  issues: [
    {
      id: 'x-1',
      title: '生きている',
      status: 'open',
      priority: 1,
      issueType: 'bug',
      labels: ['ui'],
      assignee: 'mgr-deadbeef',
      owner: 'hiroiku',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
      deps: [{ on: 'x-0', type: 'blocks' }],
    },
  ],
  counts: { open: 1, closed: 1 },
};

describe('一覧を外の形へ写す', () => {
  it('外の名前に写し、件数はそのまま渡す', () => {
    expect(presentIssues(observed(LEDGER))).toEqual({
      state: 'observed',
      reason: null,
      issues: [
        {
          id: 'x-1',
          title: '生きている',
          status: 'open',
          priority: 1,
          issue_type: 'bug',
          labels: ['ui'],
          assignee: 'mgr-deadbeef',
          owner: 'hiroiku',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-02T00:00:00Z',
          deps: [{ on: 'x-0', type: 'blocks' }],
        },
      ],
      counts: { open: 1, closed: 1 },
    });
  });

  it('書かれていなかった欄を、書かれていたことにしない', () => {
    const presented = presentIssues(
      observed({
        issues: [
          {
            id: null,
            title: null,
            status: '',
            priority: null,
            issueType: null,
            labels: null,
            assignee: null,
            owner: null,
            createdAt: null,
            updatedAt: null,
            deps: [{ on: null, type: 'parent-child' }],
          },
        ],
        counts: { '': 1 },
      }),
    );

    expect(
      presented.issues[0],
      '写す途中で既定へ倒すと、書かれていなかった欄が書かれていた欄に化ける。優先度の 0 は最も高いの意味で「無い」ではなく、札の無い課題は札が空の課題ではなく、掛かっている先の分からない繋がりは自分に掛かった繋がりではない',
    ).toEqual({
      id: null,
      title: null,
      status: '',
      priority: null,
      issue_type: null,
      labels: null,
      assignee: null,
      owner: null,
      created_at: null,
      updated_at: null,
      deps: [{ on: null, type: 'parent-child' }],
    });
  });

  it('継いだ名前と同じ状態の札も、そのまま外へ出す', () => {
    /* 素の代入では欄そのものを作れない(`__proto__` は親の付け替えに化ける)ので、
       欄を直に置く形で組む。台帳の状態がこの字だったときと同じ形である。 */
    const counts: Record<string, number> = Object.fromEntries([
      ['__proto__', 1],
      ['constructor', 2],
    ]);

    const presented = presentIssues(observed({ issues: [], counts }));
    /* 写しは `Object.assign` ではなく展開で作る。`assign` は代入の仕掛けを起こすので、
       `__proto__` の欄が黙って消え、札が 1 つ足りない一覧が外へ出る。 */
    expect(
      JSON.stringify(presented.counts),
      '状態の字を決めるのは台帳。写す途中で欄が消えると、数が合わない理由を誰も辿れない',
    ).toBe('{"__proto__":1,"constructor":2}');
  });

  it('台帳が無いことを、空の一覧として黙らせない', () => {
    expect(
      presentIssues(absent('no-source')),
      '空の一覧だけを返すと、bd を使っていない巣と課題が 1 件も無い巣が同じに見える',
    ).toEqual({ state: 'absent', reason: 'no-source', issues: [], counts: {} });
  });

  it('見に行けなかったことも、空の一覧として黙らせない', () => {
    expect(
      presentIssues(unobservable(new LedgerUnreadable('読めない'))),
      '名札をそのまま言う',
    ).toEqual({
      state: 'unobservable',
      reason: 'ledger.unreadable',
      issues: [],
      counts: {},
    });
  });
});

describe('1 件を外の形へ写す', () => {
  it('台帳に書かれていた欄をそのまま渡す', () => {
    const record = {
      _type: 'issue',
      id: 'x-1',
      status: 'open',
      description: '巨大な本文',
    };
    expect(presentIssue(observed(record)), 'bd の書き出しは既に外の名前で書かれている').toEqual({
      state: 'observed',
      reason: null,
      issue: record,
    });
  });

  it('見に行けたが無かったことを、理由ごと返す', () => {
    expect(
      presentIssue(absent('empty')),
      '台帳ごと無い(no-source)のか、その課題だけが無いのかを分ける',
    ).toEqual({ state: 'absent', reason: 'empty', issue: null });
  });
});
