import { describe, expect, it } from 'vitest';
import type { JsonRecord } from '~/app-kernel/json.ts';
import {
  buildLedger,
  parseIssueBody,
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
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.hasNextPage).toBe(true);
    expect(parsed.endCursor).toBe('Y3Vyc29y');
  });

  it.each([
    ['読めない JSON', 'not json at all'],
    ['repository が null', JSON.stringify({ data: { repository: null } })],
    ['data が無い', JSON.stringify({ errors: [{ message: 'Could not resolve to a Repository' }] })],
  ])('%s は空のページとして返す', (_name, text) => {
    const parsed = parseIssuePage(text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.hasNextPage, '読めなかったページの先を読みに行かない').toBe(false);
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

  it('優先度は無い', () => {
    const { issues } = buildLedger([node()], { includeClosed: false, truncated: false });
    expect(issues[0]?.priority, 'GitHub に優先度の欄は無い。0 にすると最優先として並ぶ').toBeNull();
  });

  it('ラベル・担当・種類・書いた人を写す', () => {
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
      owner: 'reporter',
    });
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
