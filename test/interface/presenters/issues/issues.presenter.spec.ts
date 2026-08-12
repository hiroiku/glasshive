import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  presentGithubIssueDiscussion,
  presentGithubIssueEvents,
  presentIssues,
} from '~/interface/presenters/issues/issues.presenter.ts';

/* 写す側はエラーコードしか見ない。エラー型を持ち込まずに、エラーコードだけを与えて確かめる。 */
class TrackerUnavailable extends AppError {
  readonly code = 'tracker.not_installed';
}

/** GitHub にしか無い欄。書かれていないものは全部 `null` か空で組む */
const EMPTY_GITHUB = {
  url: null,
  labels: [],
  assignees: [],
  author: null,
  milestone: null,
  issueTypeColor: null,
  subIssues: null,
  pullRequests: [],
  comments: 0,
  reactions: 0,
};

const LEDGER = {
  issues: [
    {
      id: '#1',
      title: '生きている',
      status: 'open',
      issueType: 'bug',
      labels: ['ui'],
      assignee: 'hiroiku',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
      closedAt: null,
      deps: [{ on: '#0', type: 'blocks' }],
      depsComplete: true,
      github: {
        url: 'https://github.com/hiroiku/glasshive/issues/1',
        labels: [{ name: 'ui', color: 'd73a4a' }],
        assignees: [{ login: 'hiroiku', avatarUrl: 'https://avatars.example/u/1' }],
        author: { login: 'hiroiku', avatarUrl: 'https://avatars.example/u/1' },
        milestone: { title: '2.0.0', dueOn: '2026-09-01T00:00:00Z' },
        issueTypeColor: 'RED',
        subIssues: { total: 3, completed: 1 },
        pullRequests: [
          {
            number: 12,
            state: 'OPEN',
            isDraft: false,
            reviewDecision: 'APPROVED',
            headRefName: 'feat/tabs',
          },
        ],
        comments: 2,
        reactions: 5,
      },
    },
  ],
  counts: { open: 1, closed: 1 },
  truncated: false,
};

/** 一覧と、その一覧をどこから取ったか。尋ね先まで揃えて初めて外の形になる */
const listing = <T>(ledger: T, others = 0) => ({
  ledger,
  source: { repository: { owner: 'hiroiku', name: 'glasshive' }, others },
});

describe('一覧を外の形へ写す', () => {
  it('外の名前に写し、件数はそのまま渡す', () => {
    expect(presentIssues(observed(listing(LEDGER)))).toEqual({
      state: 'observed',
      reason: null,
      issues: [
        {
          id: '#1',
          title: '生きている',
          status: 'open',
          issue_type: 'bug',
          labels: ['ui'],
          assignee: 'hiroiku',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-02T00:00:00Z',
          closed_at: null,
          deps: [{ on: '#0', type: 'blocks' }],
          deps_complete: true,
          github: {
            url: 'https://github.com/hiroiku/glasshive/issues/1',
            labels: [{ name: 'ui', color: 'd73a4a' }],
            assignees: [{ login: 'hiroiku', avatar: 'hiroiku' }],
            author: { login: 'hiroiku', avatar: 'hiroiku' },
            milestone: { title: '2.0.0', due_on: '2026-09-01T00:00:00Z' },
            issue_type_color: 'RED',
            sub_issues: { total: 3, completed: 1 },
            pull_requests: [
              {
                number: 12,
                state: 'OPEN',
                is_draft: false,
                review_decision: 'APPROVED',
                head_ref_name: 'feat/tabs',
              },
            ],
            comments: 2,
            reactions: 5,
          },
        },
      ],
      counts: { open: 1, closed: 1 },
      truncated: false,
      repository: 'hiroiku/glasshive',
      other_repositories: 0,
    });
  });

  it('GitHub の顔の URL は外へ出さない', () => {
    const [issue] = presentIssues(observed(listing(LEDGER))).issues;
    expect(
      JSON.stringify(issue?.github),
      '顔の URL をそのまま渡すと、画面が GitHub の CDN へ直に取りに行く。外へ出すのは同じ origin の URL を組む鍵だけである',
    ).not.toContain('avatars.example');
  });

  it('書かれていなかった欄を、書かれていたことにしない', () => {
    const presented = presentIssues(
      observed(
        listing({
          issues: [
            {
              id: '#2',
              title: null,
              status: 'open',
              issueType: null,
              labels: null,
              assignee: null,
              createdAt: null,
              updatedAt: null,
              closedAt: null,
              deps: [{ on: null, type: 'parent-child' }],
              depsComplete: false,
              github: EMPTY_GITHUB,
            },
          ],
          counts: { open: 1 },
          truncated: false,
        }),
      ),
    );

    expect(
      presented.issues[0],
      '写す途中で既定へ倒すと、書かれていなかった欄が書かれていた欄に化ける。ラベルの無い課題はラベルが空の課題ではなく、掛かっている先の分からない繋がりは自分に掛かった繋がりではない',
    ).toEqual({
      id: '#2',
      title: null,
      status: 'open',
      issue_type: null,
      labels: null,
      assignee: null,
      created_at: null,
      updated_at: null,
      closed_at: null,
      deps: [{ on: null, type: 'parent-child' }],
      // 掛かっている先を全部は見られなかった。埋めると、辺の欠けた依存グラフが完全な絵に見える
      deps_complete: false,
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
  });

  it('継いだ名前と同じ状態の件数も、そのまま外へ出す', () => {
    /* 素の代入では欄そのものを作れない(`__proto__` はプロトタイプの付け替えに化ける)ので、
       欄を直に置く形で組む。GitHub が返した state がこの文字列だったときと同じ形である。 */
    const counts: Record<string, number> = Object.fromEntries([
      ['__proto__', 1],
      ['constructor', 2],
    ]);

    const presented = presentIssues(observed(listing({ issues: [], counts, truncated: false })));
    /* コピーは `Object.assign` ではなく展開で作る。`assign` は setter を起こすので、
       `__proto__` の欄が黙って消え、件数が 1 つ足りない一覧が外へ出る。 */
    expect(
      JSON.stringify(presented.counts),
      '状態の文字列を決めるのは GitHub の答え。写す途中で欄が消えると、数が合わない理由を誰も辿れない',
    ).toBe('{"__proto__":1,"constructor":2}');
  });

  it('課題を尋ねる先が無いことを、空の一覧として黙らせない', () => {
    expect(
      presentIssues(absent('no-source')),
      '空の一覧だけを返すと、GitHub の remote が無いプロジェクトと課題が 1 件も無いプロジェクトが同じに見える',
    ).toEqual({
      state: 'absent',
      reason: 'no-source',
      issues: [],
      counts: {},
      truncated: false,
      repository: null,
      other_repositories: 0,
    });
  });

  it('観測できなかったことも、空の一覧として黙らせない', () => {
    expect(
      presentIssues(unobservable(new TrackerUnavailable('`gh` が無い'))),
      'エラーコードをそのまま言う',
    ).toEqual({
      state: 'unobservable',
      truncated: false,
      reason: 'tracker.not_installed',
      issues: [],
      counts: {},
      repository: null,
      other_repositories: 0,
    });
  });

  it('上限に当たって切れたことは、切れたと言う', () => {
    expect(
      presentIssues(observed(listing({ ...LEDGER, truncated: true }))).truncated,
      '黙って切ると、上限より後ろの課題が「無かった」ことになる',
    ).toBe(true);
  });

  /* remote を 2 つ以上持つプロジェクトでは glasshive が 1 つ選んでいる。
     選んだことを黙ると、選ばれなかったリポジトリの課題が「無い」ものとして読まれる。 */
  it('どこから取った一覧かを言う', () => {
    const presented = presentIssues(observed(listing(LEDGER, 1)));

    expect(presented.repository).toBe('hiroiku/glasshive');
    expect(presented.other_repositories, '尋ねなかった先が在ることを黙らせない').toBe(1);
  });
});

/* やり取りを外の形へ写す。

   相手の形は `presentGithubIssueDiscussion` 自身から引く。写す先の型を書き写して持つと、
   欄が変わったときに片方だけ古いまま残る。 */
type Discussion = Parameters<typeof presentGithubIssueDiscussion>[0];

describe('やり取りを外の形へ写す', () => {
  it('種類ごとの欄を、外の名前に写す', () => {
    const discussion: Discussion = observed({
      entries: [
        {
          kind: 'comment',
          at: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          body: '直しました',
        },
        {
          kind: 'closed',
          at: '2026-08-02T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          reason: 'COMPLETED',
        },
        { kind: 'reopened', at: '2026-08-03T00:00:00Z', actor: null },
        {
          kind: 'labeled',
          at: '2026-08-04T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          label: { name: 'ui', color: 'd73a4a' },
        },
        {
          kind: 'unlabeled',
          at: '2026-08-05T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          label: { name: 'ui', color: null },
        },
        {
          kind: 'assigned',
          at: '2026-08-06T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          assignee: { login: 'hiroiku', avatarUrl: null },
        },
        {
          kind: 'unassigned',
          at: '2026-08-07T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          assignee: null,
        },
        {
          kind: 'milestoned',
          at: '2026-08-08T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          milestoneTitle: '2.0.0',
        },
        {
          kind: 'demilestoned',
          at: '2026-08-09T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          milestoneTitle: null,
        },
        {
          kind: 'renamed',
          at: '2026-08-10T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          previousTitle: '古い題',
          currentTitle: '新しい題',
        },
        {
          kind: 'parent-added',
          at: '2026-08-11T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          parent: { number: 7, title: '親' },
        },
        {
          kind: 'blocked-by-added',
          at: '2026-08-12T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          blockingIssue: { number: 8, title: null },
        },
        {
          kind: 'marked-as-duplicate',
          at: '2026-08-13T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          canonical: { number: 9, title: '残すほう' },
        },
        {
          kind: 'cross-referenced',
          at: '2026-08-14T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          source: { number: 10, title: 'PR' },
          willCloseTarget: true,
        },
      ],
      truncated: false,
    });

    expect(presentGithubIssueDiscussion(discussion)).toEqual({
      state: 'observed',
      reason: null,
      truncated: false,
      entries: [
        {
          kind: 'comment',
          at: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          body: '直しました',
        },
        {
          kind: 'closed',
          at: '2026-08-02T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          reason: 'COMPLETED',
        },
        { kind: 'reopened', at: '2026-08-03T00:00:00Z', actor: null },
        {
          kind: 'labeled',
          at: '2026-08-04T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          label: { name: 'ui', color: 'd73a4a' },
        },
        {
          kind: 'unlabeled',
          at: '2026-08-05T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          label: { name: 'ui', color: null },
        },
        {
          kind: 'assigned',
          at: '2026-08-06T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          assignee: { login: 'hiroiku', avatar: null },
        },
        {
          kind: 'unassigned',
          at: '2026-08-07T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          assignee: null,
        },
        {
          kind: 'milestoned',
          at: '2026-08-08T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          milestone_title: '2.0.0',
        },
        {
          kind: 'demilestoned',
          at: '2026-08-09T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          milestone_title: null,
        },
        {
          kind: 'renamed',
          at: '2026-08-10T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          previous_title: '古い題',
          current_title: '新しい題',
        },
        {
          kind: 'parent-added',
          at: '2026-08-11T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          parent: { number: 7, title: '親' },
        },
        {
          kind: 'blocked-by-added',
          at: '2026-08-12T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          blocking_issue: { number: 8, title: null },
        },
        {
          kind: 'marked-as-duplicate',
          at: '2026-08-13T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          canonical: { number: 9, title: '残すほう' },
        },
        {
          kind: 'cross-referenced',
          at: '2026-08-14T00:00:00Z',
          actor: { login: 'hiroiku', avatar: 'hiroiku' },
          source: { number: 10, title: 'PR' },
          will_close_target: true,
        },
      ],
    });
  });

  it('GitHub が返した順を、写す途中で並べ替えない', () => {
    const discussion: Discussion = observed({
      entries: [
        { kind: 'reopened', at: '2026-08-03T00:00:00Z', actor: null },
        { kind: 'closed', at: '2026-08-02T00:00:00Z', actor: null, reason: null },
      ],
      truncated: false,
    });

    expect(
      presentGithubIssueDiscussion(discussion).entries.map((entry) => entry.kind),
      '並べ替えると、同じ時刻に並んだイベントの前後が入れ替わる',
    ).toEqual(['reopened', 'closed']);
  });

  it('本文の無いコメントと、本文を読めなかったコメントを分けて運ぶ', () => {
    const discussion: Discussion = observed({
      entries: [
        { kind: 'comment', at: '2026-08-01T00:00:00Z', actor: null, body: '' },
        { kind: 'comment', at: '2026-08-02T00:00:00Z', actor: null, body: null },
      ],
      truncated: false,
    });

    const [written, unreadable] = presentGithubIssueDiscussion(discussion).entries;

    expect(written).toHaveProperty('body', '');
    expect(
      unreadable,
      '空文字列を `null` と同じ形で返すと、本文の無いコメントが読めなかったコメントに見える',
    ).toHaveProperty('body', null);
  });

  it('誰も何も言っていないことを、読めなかったことにしない', () => {
    expect(presentGithubIssueDiscussion(observed({ entries: [], truncated: false }))).toEqual({
      state: 'observed',
      reason: null,
      entries: [],
      truncated: false,
    });
  });

  it('読みに行けなかったことを、空のやり取りとして黙らせない', () => {
    expect(
      presentGithubIssueDiscussion(unobservable(new TrackerUnavailable('`gh` が無い'))),
      '空の並びだけを返すと、誰も何も書いていない課題と `gh` が答えなかった課題が同じ画面になる',
    ).toEqual({
      state: 'unobservable',
      reason: 'tracker.not_installed',
      entries: [],
      truncated: false,
    });
  });

  it('尋ねる先が無いことも、空のやり取りとして黙らせない', () => {
    expect(presentGithubIssueDiscussion(absent('no-source'))).toEqual({
      state: 'absent',
      reason: 'no-source',
      entries: [],
      truncated: false,
    });
  });

  it('上限に当たって切れたことは、切れたと言う', () => {
    expect(
      presentGithubIssueDiscussion(observed({ entries: [], truncated: true })).truncated,
      '黙って切ると、上限より後ろの発言が「無かった」ことになる',
    ).toBe(true);
  });
});

describe('一覧ぶんのイベントを外の形へ写す', () => {
  const log = {
    issues: [
      {
        id: '#101',
        events: [
          { at: '2026-08-01T00:00:00Z', kind: 'labeled' as const },
          { at: '2026-08-02T00:00:00Z', kind: 'closed' as const },
        ],
        truncated: false,
      },
      { id: '#102', events: [], truncated: true },
    ],
    complete: true,
  };

  it('課題ごとに、順序も切られたことも触らずに写す', () => {
    const presented = presentGithubIssueEvents(observed(log));

    expect(presented).toEqual({
      state: 'observed',
      reason: null,
      issues: [
        {
          id: '#101',
          events: [
            { at: '2026-08-01T00:00:00Z', kind: 'labeled' },
            { at: '2026-08-02T00:00:00Z', kind: 'closed' },
          ],
          truncated: false,
        },
        { id: '#102', events: [], truncated: true },
      ],
      complete: true,
    });
  });

  it('何も起きていない一覧と、読めなかった一覧を別の答えにする', () => {
    const quiet = presentGithubIssueEvents(observed({ issues: [], complete: true }));
    const gone = presentGithubIssueEvents(absent('no-source'));
    const blind = presentGithubIssueEvents(unobservable(new TrackerUnavailable('gh が答えない')));

    expect(quiet.state).toBe('observed');
    expect(quiet.complete).toBe(true);
    expect(gone.state).toBe('absent');
    expect(gone.reason).toBe('no-source');
    expect(blind.state).toBe('unobservable');
    expect(blind.reason).toBe('tracker.not_installed');
    expect(
      blind.complete,
      '読めなかった一覧を「全部辿れた」と言うと、点の無い行が静かな課題に見える',
    ).toBe(false);
  });
});
