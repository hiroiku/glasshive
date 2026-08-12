import { describe, expect, it } from 'vitest';
import type { JsonRecord } from '~/app-kernel/json.ts';
import {
  buildLedger,
  parseIssueBody,
  parseIssueDiscussion,
  parseIssueEventsPage,
  parseIssuePage,
} from '~/domain/services/issues/github-issue.service.ts';

/** 応答 1 件ぶんの素材。書いていない欄は GitHub が返さなかったものとして扱われる */
const node = (overrides: Partial<Record<string, unknown>> = {}): JsonRecord => ({
  number: 1,
  title: 'Widen the health check window',
  state: 'OPEN',
  stateReason: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  author: { login: 'hiroiku' },
  issueType: null,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  parent: null,
  blockedBy: { nodes: [] },
  ...overrides,
});

const page = (issues: Record<string, unknown>) =>
  JSON.stringify({ data: { repository: { issues } } });

describe('応答 1 ページを読む', () => {
  it('課題と、次のページの在りかを取り出す', () => {
    const text = page({
      pageInfo: { hasNextPage: true, endCursor: 'Y3Vyc29y' },
      nodes: [node({ number: 7 }), node({ number: 8 })],
    });
    const parsed = parseIssuePage(text);
    expect(parsed?.nodes).toHaveLength(2);
    expect(parsed?.hasNextPage).toBe(true);
    expect(parsed?.endCursor).toBe('Y3Vyc29y');
  });

  /* 歩く先の全部の件数は、この応答にしか無い。**0 と「答えていない」を同じにしない** ——
     潰すと、分母を観測できていないのに割合を塗ることになる。 */
  it('歩く先の全部の件数を、答えのとおりに持ち帰る', () => {
    const counted = parseIssuePage(page({ totalCount: 1204, nodes: [node({ number: 7 })] }));
    const silent = parseIssuePage(page({ nodes: [node({ number: 7 })] }));
    const empty = parseIssuePage(page({ totalCount: 0, nodes: [] }));

    expect(counted?.total).toBe(1204);
    expect(silent?.total, '答えていない総数を 0 にすると、0 件のリポジトリと同じ形になる').toBe(
      null,
    );
    expect(empty?.total, '0 件だと答えられたことは、答えられていないこととは別である').toBe(0);
  });

  it.each([
    ['数でない', '1204'],
    ['null である', null],
  ])('総数が%sときは、答えられていないものとして返す', (_name, totalCount) => {
    expect(
      parseIssuePage(page({ totalCount, nodes: [] }))?.total,
      '読めない値を数として持ち帰ると、その数で割った割合が出る',
    ).toBe(null);
  });

  it('課題が 1 件も無いページは、歩けたものとして返す', () => {
    const parsed = parseIssuePage(
      page({ pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] }),
    );
    expect(parsed, '歩けて 0 件だったのは、応答を歩けなかったのとは別のことである').not.toBe(null);
    expect(parsed?.nodes).toEqual([]);
  });

  it.each([
    ['読めない JSON', 'not json at all'],
    ['repository が null', JSON.stringify({ data: { repository: null } })],
    ['data が無い', JSON.stringify({ errors: [{ message: 'Could not resolve to a Repository' }] })],
  ])('%s は、歩けなかったこととして返す', (_name, text) => {
    expect(
      parseIssuePage(text),
      '空のページとして返すと、歩けなかった応答が「課題は 1 件も無い」になる',
    ).toBe(null);
  });

  /* `issues` まで辿れていても、課題の並びが無ければ 1 件も観ていない。
     `?? []` で空の並びに倒すと、歩けなかった応答が「課題は 1 件も無い」として通る。 */
  it.each([
    ['`nodes` が無い', { pageInfo: { hasNextPage: false, endCursor: null } }],
    ['`nodes` が null', { pageInfo: { hasNextPage: false, endCursor: null }, nodes: null }],
    ['`nodes` が並びでない', { nodes: { edges: [] } }],
  ])('%s ページも、歩けなかったこととして返す', (_name, issues) => {
    expect(
      parseIssuePage(page(issues)),
      '課題の並びを辿れなかったことを、0 件だったことにしない',
    ).toBe(null);
  });

  it('`pageInfo` の無いページは、次が無いページとして歩けたことにする', () => {
    const parsed = parseIssuePage(page({ nodes: [node({ number: 7 })] }));

    expect(
      parsed?.nodes,
      '尋ねなかった `pageInfo` は、課題を辿れないこととは別である',
    ).toHaveLength(1);
    expect(parsed?.hasNextPage).toBe(false);
    expect(parsed?.endCursor).toBe(null);
  });
});

/* id は `#12` の形で、画面はここから `12` を取り出して本文とやり取りを尋ね直す。
   **取り出して同じ番号に戻らない値から id を作らない** —— `#1.5` のパネルが `#1` の本文を
   自分のものとして描く。0 も負も、GitHub の一覧に現れる番号ではない。 */
describe('尋ね直せない番号は、課題の番号ではない', () => {
  const numbered = (number: unknown) =>
    buildLedger([node({ number })], { includeClosed: false, truncated: false }).issues;

  it.each([
    ['小数', 1.5],
    ['0', 0],
    ['負', -3],
    ['安全な整数を超える', Number.MAX_SAFE_INTEGER + 2],
    ['数ではない', '12'],
  ])('%s の番号を持つ課題は、一覧に出さない', (_name, number) => {
    expect(
      numbered(number),
      'この id からは尋ね直せない。一覧に出すと、開いたパネルが別の課題の本文を描く',
    ).toEqual([]);
  });

  it('尋ね直せない番号への依存は、辺にしない', () => {
    const { issues } = buildLedger(
      [node({ number: 12, parent: { number: 0 }, blockedBy: { nodes: [{ number: 1.5 }] } })],
      { includeClosed: false, truncated: false },
    );

    expect(
      issues[0]?.deps,
      '一覧に出ない相手への辺は、どこにも着かないまま堰き止めているように描かれる',
    ).toEqual([]);
  });

  it('尋ね直せない番号の記録も、行として持ち帰らない', () => {
    const parsed = parseIssueEventsPage(
      JSON.stringify({
        data: {
          repository: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{ number: 0, timelineItems: { nodes: [], totalCount: 0 } }],
            },
          },
        },
      }),
    );

    expect(parsed?.issues, '一覧に居ない id の点は、どの行にも置けない').toEqual([]);
  });
});

describe('GitHub の課題を台帳の形へ写す', () => {
  it('親を parent-child に、堰き止めを blocks に写す', () => {
    const { issues } = buildLedger(
      [node({ number: 12, parent: { number: 3 }, blockedBy: { nodes: [{ number: 9 }] } })],
      { includeClosed: false, truncated: false },
    );
    expect(
      issues[0]?.deps,
      'この 2 つの種類だけを画面が見ている。別の名前で書くと、入れ子も依存の辺も描かれない',
    ).toEqual([
      { on: '#3', type: 'parent-child' },
      { on: '#9', type: 'blocks' },
    ]);
  });

  it('堰き止められている課題を blocked と呼ぶ', () => {
    const { issues } = buildLedger([node({ blockedBy: { nodes: [{ number: 9 }] } })], {
      includeClosed: false,
      truncated: false,
    });
    expect(issues[0]?.status).toBe('blocked');
  });

  it('堰き止めていた相手が閉じたら、もう blocked ではない', () => {
    const { issues } = buildLedger(
      [
        node({
          blockedBy: {
            nodes: [
              { number: 9, state: 'CLOSED' },
              { number: 10, state: 'OPEN' },
            ],
          },
        }),
        node({ number: 2, blockedBy: { nodes: [{ number: 9, state: 'CLOSED' }] } }),
      ],
      { includeClosed: false, truncated: false },
    );

    expect(issues[0]?.status, 'まだ開いている相手が 1 つでも残っていれば blocked').toBe('blocked');
    expect(
      issues[1]?.status,
      '片付いた相手を数え続けると、いま手を付けられる課題が blocked のまま並ぶ',
    ).toBe('open');
  });

  it('片付いた相手も、依存の辺としては残す', () => {
    const { issues } = buildLedger(
      [node({ blockedBy: { nodes: [{ number: 9, state: 'CLOSED' }] } })],
      { includeClosed: false, truncated: false },
    );

    expect(issues[0]?.deps, '辺を消すと、何がこの課題を待たせていたのかが読めなくなる').toEqual([
      { on: '#9', type: 'blocks' },
    ]);
  });

  it('閉じた課題は、堰き止めが残っていても closed である', () => {
    const { counts } = buildLedger(
      [node({ state: 'CLOSED', blockedBy: { nodes: [{ number: 9 }] } })],
      { includeClosed: true, truncated: false },
    );
    expect(counts, '片付いた課題を blocked として並べると、残りの仕事が実際より多く見える').toEqual(
      { closed: 1 },
    );
  });

  it('閉じた時刻を `updatedAt` で代用せずに運ぶ', () => {
    const { issues } = buildLedger(
      [
        node({
          state: 'CLOSED',
          stateReason: 'COMPLETED',
          closedAt: '2026-08-01T12:00:00Z',
          updatedAt: '2026-08-05T00:00:00Z',
        }),
      ],
      { includeClosed: true, truncated: false },
    );

    expect(issues[0]?.closedAt, '閉じた後に触られても、閉じた時刻は動かない').toBe(
      '2026-08-01T12:00:00Z',
    );
    expect(issues[0]?.updatedAt).toBe('2026-08-05T00:00:00Z');
  });

  it('閉じた時刻を返さなかった応答では、閉じた時刻を持たない', () => {
    const { issues } = buildLedger([node({ state: 'CLOSED' })], {
      includeClosed: true,
      truncated: false,
    });

    expect(issues[0]?.closedAt, '無いものを `updatedAt` で埋めない').toBeNull();
  });

  it('やらないことにした課題を、やり終えた課題と混ぜない', () => {
    const { counts } = buildLedger(
      [
        node({ number: 1, state: 'CLOSED', stateReason: 'COMPLETED' }),
        node({ number: 2, state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
      ],
      { includeClosed: true, truncated: false },
    );
    expect(counts).toEqual({ closed: 1, not_planned: 1 });
  });

  it('落とした課題も件数には数える', () => {
    const ledger = buildLedger(
      [
        node({ number: 1 }),
        node({ number: 2, state: 'CLOSED' }),
        node({ number: 3, state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
      ],
      { includeClosed: false, truncated: false },
    );
    expect(ledger.issues.map((issue) => issue.id)).toEqual(['#1']);
    expect(ledger.counts, '隠していても「いくつ閉じたか」は見せる').toEqual({
      open: 1,
      closed: 1,
      not_planned: 1,
    });
  });

  it('ラベル・担当・種類を写し、書いた人は GitHub の欄に残す', () => {
    const { issues } = buildLedger(
      [
        node({
          issueType: { name: 'Bug' },
          labels: { nodes: [{ name: 'p2' }, { name: 'chore' }] },
          assignees: { nodes: [{ login: 'someone' }, { login: 'another' }] },
          author: { login: 'reporter' },
        }),
      ],
      { includeClosed: false, truncated: false },
    );
    expect(issues[0]).toMatchObject({
      issueType: 'Bug',
      labels: ['p2', 'chore'],
      assignee: 'someone',
    });
    expect(issues[0]?.github.author?.login, '書いた人は GitHub にしか無い欄である').toBe(
      'reporter',
    );
  });

  it('番号を持たない記録は課題にしない', () => {
    const { issues, counts } = buildLedger([{ title: 'no number' }], {
      includeClosed: true,
      truncated: false,
    });
    expect(issues, '欄の空いた課題として並べると、開けない行が一覧に混ざる').toEqual([]);
    expect(counts).toEqual({});
  });

  it('上限に当たったことを持ち回る', () => {
    const ledger = buildLedger([node()], { includeClosed: false, truncated: true });
    expect(ledger.truncated, '黙って切ると、その先の課題が「無かった」ことになる').toBe(true);
  });
});

/* GitHub にしか無い欄。台帳と同じ形に写す先が無かったものを、落とさずに運ぶ。

   見るのはひとつだけ —— **無いものを既定値で埋めていないか。** マイルストーンも型の色も
   sub-issue も、無いことと「0 だった」ことは別である。 */
describe('GitHub にしか無い欄を運ぶ', () => {
  const githubOf = (over: Partial<Record<string, unknown>>) =>
    buildLedger([node(over)], { includeClosed: false, truncated: false }).issues[0]?.github;

  it('label は色ごと運ぶ', () => {
    const github = githubOf({
      labels: { nodes: [{ name: 'bug', color: 'd73a4a' }, { name: 'area:parser' }] },
    });

    expect(github?.labels, 'GitHub が付けた色をこちらで塗り直さない').toEqual([
      { name: 'bug', color: 'd73a4a' },
      { name: 'area:parser', color: null },
    ]);
  });

  it('担当は全員を、顔の URL ごと運ぶ', () => {
    const github = githubOf({
      assignees: {
        nodes: [
          { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          { login: 'octocat' },
        ],
      },
    });

    expect(github?.assignees).toEqual([
      { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
      { login: 'octocat', avatarUrl: null },
    ]);
  });

  it('login の読めない相手は採らない', () => {
    const github = githubOf({
      assignees: { nodes: [{ avatarUrl: 'https://example.test/x.png' }] },
    });

    expect(github?.assignees, '誰なのか言えない顔を、担当として並べない').toEqual([]);
  });

  it('この課題を閉じる PR を、下書きかどうかごと運ぶ', () => {
    const github = githubOf({
      closedByPullRequestsReferences: {
        nodes: [
          {
            number: 7,
            state: 'OPEN',
            isDraft: false,
            reviewDecision: 'APPROVED',
            headRefName: 'feat/parse-manifest',
          },
          { number: 8, state: 'OPEN', isDraft: true, headRefName: 'feat/validate-schema' },
        ],
      },
    });

    expect(github?.pullRequests).toEqual([
      {
        number: 7,
        state: 'OPEN',
        isDraft: false,
        reviewDecision: 'APPROVED',
        headRefName: 'feat/parse-manifest',
      },
      {
        number: 8,
        state: 'OPEN',
        isDraft: true,
        reviewDecision: null,
        headRefName: 'feat/validate-schema',
      },
    ]);
  });

  it('マイルストーンも型の色も、無ければ無いままにする', () => {
    const github = githubOf({ milestone: null, issueType: null });

    expect(github?.milestone, '期限の無い束を、既定のマイルストーンで埋めない').toBe(null);
    expect(github?.issueTypeColor, '組織が型を決めていないことを、既定の色で隠さない').toBe(null);
  });

  it('束の消化は、取ってきたページに依らない総数で持つ', () => {
    const github = githubOf({ subIssuesSummary: { total: 5, completed: 2 } });

    expect(
      github?.subIssues,
      '数え直すと、一覧を絞ったぶんだけ分母が減って、進んだ束ほど進みが少なく見える',
    ).toEqual({ total: 5, completed: 2 });
  });
});

/* 掛かっている先を全部見られたか。

   GitHub は 1 件あたりの依存にも上限を掛けて返す。**上限に当たったことを言えないと、
   辺が 1 本足りない絵が正しい絵として出る** —— 着手できないものが着手できると読める。 */
describe('依存が全部見えたかを言う', () => {
  const completeOf = (over: Partial<Record<string, unknown>>) =>
    buildLedger([node(over)], { includeClosed: false, truncated: false }).issues[0]?.depsComplete;

  it('採った数が総数と合っていれば、全部見えている', () => {
    expect(
      completeOf({
        blockedBy: { nodes: [{ number: 2 }, { number: 3 }] },
        issueDependenciesSummary: { totalBlockedBy: 2, totalBlocking: 0 },
      }),
    ).toBe(true);
  });

  it('総数のほうが多ければ、切れている', () => {
    expect(
      completeOf({
        blockedBy: { nodes: [{ number: 2 }] },
        issueDependenciesSummary: { totalBlockedBy: 9, totalBlocking: 0 },
      }),
      '黙って切ると、上限より後ろの依存が「無かった」ことになる',
    ).toBe(false);
  });

  it('総数を尋ねていなければ、足りているとは言わない', () => {
    expect(
      completeOf({ blockedBy: { nodes: [] } }),
      '尋ねなかったことを「全部見えた」に倒すと、切れた辺が黙って消える',
    ).toBe(false);
  });

  it('1 つも掛かっていないときも、総数と合っていれば全部見えている', () => {
    expect(
      completeOf({
        blockedBy: { nodes: [] },
        issueDependenciesSummary: { totalBlockedBy: 0, totalBlocking: 0 },
      }),
    ).toBe(true);
  });
});

describe('課題 1 件の本文を取り出す', () => {
  const answerOf = (issue: unknown) => JSON.stringify({ data: { repository: { issue } } });

  it('書かれたままの Markdown を返す', () => {
    expect(parseIssueBody(answerOf({ body: '# 見出し\n本文' }))).toBe('# 見出し\n本文');
  });

  it('本文が空でも、空のまま返す', () => {
    expect(
      parseIssueBody(answerOf({ body: '' })),
      'null に潰すと、本文の無い課題と応答の壊れた課題が同じになる',
    ).toBe('');
  });

  it('課題を辿れなければ、無いと言う', () => {
    expect(parseIssueBody(answerOf(null))).toBe(null);
    expect(parseIssueBody('{}')).toBe(null);
    expect(parseIssueBody('これは JSON ではない')).toBe(null);
  });
});

/* 課題 1 件のやり取り。コメントと `timeline` のイベントを 1 つの並びにする。

   見るのは 2 つ —— **何が起きたのかを言えているか**と、言えない項目を並びに混ぜていないか。 */
describe('課題 1 件のやり取りを読む', () => {
  const discussionOf = (nodes: readonly unknown[], pageInfo: Record<string, unknown> = {}) =>
    JSON.stringify({
      data: {
        repository: {
          issue: {
            timelineItems: {
              pageInfo: { hasNextPage: false, endCursor: null, ...pageInfo },
              nodes,
            },
          },
        },
      },
    });

  it('コメントとイベントを、GitHub が返した順のまま並べる', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'LabeledEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          label: { name: 'enhancement', color: 'a2eeef' },
        },
        {
          __typename: 'IssueComment',
          createdAt: '2026-08-01T01:00:00Z',
          author: { login: 'octocat' },
          body: '書いた本文',
        },
        {
          __typename: 'ParentIssueAddedEvent',
          createdAt: '2026-08-01T02:00:00Z',
          actor: { login: 'hiroiku' },
          parent: { number: 3, title: '束ねている課題' },
        },
      ]),
    );

    expect(
      page?.entries.map((entry) => entry.kind),
      '並べ替えると、前後が入れ替わる',
    ).toEqual(['labeled', 'comment', 'parent-added']);
    expect(page?.entries[1]).toEqual({
      kind: 'comment',
      at: '2026-08-01T01:00:00Z',
      actor: { login: 'octocat', avatarUrl: null },
      body: '書いた本文',
    });
  });

  it('コメントを書いた人は `author` から、イベントを起こした人は `actor` から採る', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'IssueComment',
          createdAt: '2026-08-01T00:00:00Z',
          author: { login: 'octocat' },
          body: '',
        },
        {
          __typename: 'ReopenedEvent',
          createdAt: '2026-08-01T01:00:00Z',
          actor: { login: 'hiroiku' },
        },
      ]),
    );

    expect(page?.entries.map((entry) => entry.actor?.login)).toEqual(['octocat', 'hiroiku']);
  });

  it('誰が起こしたか読めなくても、起きたことは残す', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        { __typename: 'ReopenedEvent', createdAt: '2026-08-01T00:00:00Z', actor: null },
      ]),
    );

    expect(page?.entries, '消えたユーザーの操作を、起きなかったことにしない').toEqual([
      { kind: 'reopened', at: '2026-08-01T00:00:00Z', actor: null },
    ]);
  });

  /* やり取りに出てくる人の顔も、一覧の担当と同じ読み方で採る。**採らないと、ラベルを
     付けた人や改題した人の顔だけがどこからも引けない** —— 一覧に出るのは担当と書いた人だけ
     だからである。顔を引けないことと、誰も名指されていないことは別のままにする。 */
  it('やり取りで名指された人の顔の URL も採る', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'LabeledEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
          label: { name: 'ui', color: 'd73a4a' },
        },
        {
          __typename: 'AssignedEvent',
          createdAt: '2026-08-02T00:00:00Z',
          actor: { login: 'octocat' },
          assignee: { login: 'rin', avatarUrl: 'https://avatars.githubusercontent.com/u/2?s=48' },
        },
      ]),
    );
    const [labeled, assigned] = page?.entries ?? [];

    expect(labeled?.actor).toEqual({
      login: 'hiroiku',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48',
    });
    expect(assigned?.actor, 'URL を返さない相手も居る。名指されていないことにはしない').toEqual({
      login: 'octocat',
      avatarUrl: null,
    });
    expect(
      assigned?.kind === 'assigned' ? assigned.assignee : null,
      '担当にされた人も名指された 1 人である',
    ).toEqual({ login: 'rin', avatarUrl: 'https://avatars.githubusercontent.com/u/2?s=48' });
  });

  it('本文の無いコメントと、本文を読めなかったコメントを分ける', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'IssueComment',
          createdAt: '2026-08-01T00:00:00Z',
          author: { login: 'octocat' },
          body: '',
        },
        { __typename: 'IssueComment', createdAt: '2026-08-01T01:00:00Z', author: null },
      ]),
    );

    expect(
      page?.entries.map((entry) => (entry.kind === 'comment' ? entry.body : undefined)),
    ).toEqual(['', null]);
  });

  it('閉じた理由を落とさない', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'ClosedEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          stateReason: 'NOT_PLANNED',
        },
      ]),
    );

    expect(page?.entries[0], 'やらないことにしたのと、やり終えたのは別である').toEqual({
      kind: 'closed',
      at: '2026-08-01T00:00:00Z',
      actor: { login: 'hiroiku', avatarUrl: null },
      reason: 'NOT_PLANNED',
    });
  });

  it('ラベルは色ごと持つ', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'UnlabeledEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          label: { name: 'bug' },
        },
      ]),
    );

    expect(page?.entries[0]).toEqual({
      kind: 'unlabeled',
      at: '2026-08-01T00:00:00Z',
      actor: { login: 'hiroiku', avatarUrl: null },
      label: { name: 'bug', color: null },
    });
  });

  it('名指した課題を、番号と題で持つ', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'BlockedByAddedEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          blockingIssue: { number: 9, title: '先に片付ける課題' },
        },
        {
          __typename: 'MarkedAsDuplicateEvent',
          createdAt: '2026-08-01T01:00:00Z',
          actor: { login: 'hiroiku' },
          canonical: { number: 4, title: '元の課題' },
        },
      ]),
    );

    expect(page?.entries).toEqual([
      {
        kind: 'blocked-by-added',
        at: '2026-08-01T00:00:00Z',
        actor: { login: 'hiroiku', avatarUrl: null },
        blockingIssue: { number: 9, title: '先に片付ける課題' },
      },
      {
        kind: 'marked-as-duplicate',
        at: '2026-08-01T01:00:00Z',
        actor: { login: 'hiroiku', avatarUrl: null },
        canonical: { number: 4, title: '元の課題' },
      },
    ]);
  });

  it('触れただけの参照と、閉じる約束をした参照を分ける', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'CrossReferencedEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          willCloseTarget: true,
          source: { number: 21, title: 'Add the discussion panel' },
        },
        {
          __typename: 'CrossReferencedEvent',
          createdAt: '2026-08-01T01:00:00Z',
          actor: { login: 'hiroiku' },
          source: { number: 22, title: 'Unrelated note' },
        },
      ]),
    );

    expect(
      page?.entries.map((entry) =>
        entry.kind === 'cross-referenced' ? entry.willCloseTarget : undefined,
      ),
    ).toEqual([true, false]);
  });

  it('題の変更を、前後どちらも持つ', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'RenamedTitleEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          previousTitle: 'Old title',
          currentTitle: 'New title',
        },
      ]),
    );

    expect(page?.entries[0]).toMatchObject({
      kind: 'renamed',
      previousTitle: 'Old title',
      currentTitle: 'New title',
    });
  });

  it('マイルストーンは題だけが返る', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        {
          __typename: 'MilestonedEvent',
          createdAt: '2026-08-01T00:00:00Z',
          actor: { login: 'hiroiku' },
          milestoneTitle: 'v0.2',
        },
      ]),
    );

    expect(page?.entries[0]).toMatchObject({ kind: 'milestoned', milestoneTitle: 'v0.2' });
  });

  it('何が起きたのか言えない項目は採らない', () => {
    const page = parseIssueDiscussion(
      discussionOf([
        // 尋ねていない種類。GitHub は `timeline` に新しいイベントを足し続ける
        { __typename: 'PinnedEvent', createdAt: '2026-08-01T00:00:00Z', actor: { login: 'x' } },
        // 時刻が読めないと、並びの中に置く位置が決まらない
        { __typename: 'ReopenedEvent', actor: { login: 'x' } },
        // どのラベルの話なのか言えない
        { __typename: 'LabeledEvent', createdAt: '2026-08-01T02:00:00Z', label: null },
        // 何を指したのか言えない
        { __typename: 'ParentIssueAddedEvent', createdAt: '2026-08-01T03:00:00Z', parent: {} },
        { __typename: 'ReopenedEvent', createdAt: '2026-08-01T04:00:00Z', actor: { login: 'x' } },
      ]),
    );

    expect(
      page?.entries.map((entry) => entry.at),
      '読めない項目を並びに混ぜても、読む人には何も伝わらない',
    ).toEqual(['2026-08-01T04:00:00Z']);
  });

  it('次のページの在りかを取り出す', () => {
    const page = parseIssueDiscussion(
      discussionOf([], { hasNextPage: true, endCursor: 'Y3Vyc29y' }),
    );

    expect(page?.hasNextPage).toBe(true);
    expect(page?.endCursor).toBe('Y3Vyc29y');
  });

  it('やり取りの無い課題は、空の並びとして読める', () => {
    const page = parseIssueDiscussion(discussionOf([]));

    expect(page?.entries, '誰も何も言っていないのは、読めなかったのとは違う').toEqual([]);
  });

  it.each([
    ['読めない JSON', 'これは JSON ではない'],
    ['課題が null', JSON.stringify({ data: { repository: { issue: null } } })],
    ['`timelineItems` が無い', JSON.stringify({ data: { repository: { issue: {} } } })],
    ['data が無い', JSON.stringify({ errors: [{ message: 'Could not resolve to a Repository' }] })],
  ])('%s は辿れなかったと言う', (_name, text) => {
    expect(parseIssueDiscussion(text)).toBe(null);
  });
});

/** 一覧ぶんのイベントの応答。`timelineItems` を持つ課題の並び */
const eventsPage = (issues: Record<string, unknown>) =>
  JSON.stringify({ data: { repository: { issues } } });

const timeline = (
  nodes: readonly Record<string, unknown>[],
  totalCount = nodes.length,
): Record<string, unknown> => ({ totalCount, nodes });

describe('一覧ぶんのイベントを読む', () => {
  it('課題ごとに、起きた時刻と種類だけを取り出す', () => {
    const page = parseIssueEventsPage(
      eventsPage({
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            number: 101,
            timelineItems: timeline([
              { __typename: 'LabeledEvent', createdAt: '2026-08-01T00:00:00Z' },
              { __typename: 'IssueComment', createdAt: '2026-08-02T00:00:00Z' },
              { __typename: 'ClosedEvent', createdAt: '2026-08-03T00:00:00Z' },
            ]),
          },
        ],
      }),
    );

    expect(page?.issues[0]?.id, '一覧の行と突き合わせる鍵は `#<番号>` である').toBe('#101');
    expect(page?.issues[0]?.events).toEqual([
      { at: '2026-08-01T00:00:00Z', kind: 'labeled' },
      { at: '2026-08-02T00:00:00Z', kind: 'comment' },
      { at: '2026-08-03T00:00:00Z', kind: 'closed' },
    ]);
  });

  it('種類の言葉は、やり取りのパネルと同じものにする', () => {
    const page = parseIssueEventsPage(
      eventsPage({
        nodes: [
          {
            number: 1,
            timelineItems: timeline([
              { __typename: 'CrossReferencedEvent', createdAt: '2026-08-01T00:00:00Z' },
              { __typename: 'BlockedByAddedEvent', createdAt: '2026-08-01T01:00:00Z' },
              { __typename: 'MarkedAsDuplicateEvent', createdAt: '2026-08-01T02:00:00Z' },
              { __typename: 'ParentIssueAddedEvent', createdAt: '2026-08-01T03:00:00Z' },
            ]),
          },
        ],
      }),
    );

    expect(
      page?.issues[0]?.events.map((event) => event.kind),
      '同じ課題に起きたことを、パネルと点で違う名前で呼ばない',
    ).toEqual(['cross-referenced', 'blocked-by-added', 'marked-as-duplicate', 'parent-added']);
  });

  it('時刻の無い項目と、知らない種類は落とす', () => {
    const page = parseIssueEventsPage(
      eventsPage({
        nodes: [
          {
            number: 1,
            timelineItems: timeline([
              { __typename: 'LabeledEvent' },
              { __typename: 'SubscribedEvent', createdAt: '2026-08-01T00:00:00Z' },
              { __typename: 'ClosedEvent', createdAt: '2026-08-02T00:00:00Z' },
            ]),
          },
        ],
      }),
    );

    expect(page?.issues[0]?.events).toEqual([{ at: '2026-08-02T00:00:00Z', kind: 'closed' }]);
  });

  it('切られたかどうかは、返ってきた項目の数で決める', () => {
    const page = parseIssueEventsPage(
      eventsPage({
        nodes: [
          {
            number: 1,
            /* 3 件返ってきて総数が 141。上限に当たっている */
            timelineItems: timeline(
              [
                { __typename: 'ClosedEvent', createdAt: '2026-08-01T00:00:00Z' },
                { __typename: 'LabeledEvent' },
                { __typename: 'SubscribedEvent', createdAt: '2026-08-01T01:00:00Z' },
              ],
              141,
            ),
          },
          {
            number: 2,
            timelineItems: timeline([
              { __typename: 'LabeledEvent' },
              { __typename: 'SubscribedEvent', createdAt: '2026-08-01T00:00:00Z' },
            ]),
          },
        ],
      }),
    );

    expect(page?.issues[0]?.truncated).toBe(true);
    expect(page?.issues[1]?.truncated, 'こちらが落とした項目を、GitHub が切ったことにしない').toBe(
      false,
    );
  });

  it('番号を持たない記録は課題にしない', () => {
    const page = parseIssueEventsPage(
      eventsPage({
        nodes: [{ timelineItems: timeline([]) }, { number: 2, timelineItems: timeline([]) }],
      }),
    );

    expect(page?.issues.map((issue) => issue.id)).toEqual(['#2']);
  });

  it('続きの位置を持ち回る', () => {
    const page = parseIssueEventsPage(
      eventsPage({ pageInfo: { hasNextPage: true, endCursor: 'Y3Vyc29y' }, nodes: [] }),
    );

    expect(page).toEqual({ issues: [], endCursor: 'Y3Vyc29y', hasNextPage: true });
  });

  it('読めない応答は `null` で返す', () => {
    expect(parseIssueEventsPage('{')).toBeNull();
    expect(
      parseIssueEventsPage(JSON.stringify({ data: { repository: null } })),
      '空の一覧として返すと、読めなかったことが「何も起きていない」に化ける',
    ).toBeNull();
  });
});
