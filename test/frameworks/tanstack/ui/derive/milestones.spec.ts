import { describe, expect, it } from 'vitest';
import {
  buildMilestones,
  milestoneOf,
  milestonesOnBranch,
} from '~/frameworks/tanstack/ui/derive/milestones.ts';
import type { WorkerIndex } from '~/frameworks/tanstack/ui/derive/workers.ts';
import type { WorkJoin } from '~/frameworks/tanstack/ui/derive/workJoin.ts';

/* マイルストーンは、取ってきた課題を名前で束ね直したものである。新しい観測ではない。

   見るのは 3 つ —— 束ね方、並び、そして「まだ見ていないもの」を作らないこと。
   期日は課題ごとに付いてくるので、同じ名前でも期日の空いた課題が混ざる。 */

/* 課題の形は、束ねる実装そのものから引く。ここは外部 API の形を宣言した層を `import` できない。 */
type IssueSummaryJson = Parameters<typeof buildMilestones>[0][number];

const EMPTY_WORKERS: WorkerIndex = new Map();

const issue = (over: Partial<IssueSummaryJson> = {}): IssueSummaryJson =>
  ({
    id: '#1',
    title: 'Widen the health check window',
    status: 'open',
    priority: null,
    issue_type: null,
    labels: null,
    assignee: null,
    owner: null,
    created_at: null,
    updated_at: null,
    deps: [],
    deps_complete: true,
    github: null,
    ...over,
  }) as IssueSummaryJson;

const withMilestone = (
  id: string,
  title: string | null,
  dueOn: string | null,
  over: Partial<IssueSummaryJson> = {},
): IssueSummaryJson =>
  issue({
    id,
    ...over,
    github: {
      url: null,
      author: null,
      assignees: [],
      labels: [],
      issue_type_color: null,
      milestone: title === null ? null : { title, due_on: dueOn },
      parent: null,
      sub_issues: null,
      pull_requests: [],
      comments: 0,
      reactions: 0,
      ...(over.github ?? {}),
    },
  } as Partial<IssueSummaryJson>);

describe('課題をマイルストーンで束ねる', () => {
  it('同じ名前を 1 つの束にして、閉じた数を数える', () => {
    const rows = buildMilestones(
      [
        withMilestone('#1', 'v1.0', '2026-09-01T00:00:00Z'),
        withMilestone('#2', 'v1.0', null, { status: 'closed' }),
        withMilestone('#3', 'v1.0', null, { status: 'blocked' }),
      ],
      undefined,
      EMPTY_WORKERS,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'v1.0', total: 3, closed: 1, open: 2, blocked: 1 });
  });

  it('期日を、期日の空いた課題で消さない', () => {
    const rows = buildMilestones(
      [
        withMilestone('#1', 'v1.0', null),
        withMilestone('#2', 'v1.0', '2026-09-01T00:00:00Z'),
        withMilestone('#3', 'v1.0', null),
      ],
      undefined,
      EMPTY_WORKERS,
    );

    expect(rows[0]?.dueOn, '束ね直すたびに期日を失うと、いつまでの区切りか読めなくなる').toBe(
      '2026-09-01T00:00:00Z',
    );
  });

  it('期日の近い順に並べ、期日の無い束を後ろへ置く', () => {
    const rows = buildMilestones(
      [
        withMilestone('#1', 'later', '2026-12-01T00:00:00Z'),
        withMilestone('#2', 'undated', null),
        withMilestone('#3', 'sooner', '2026-09-01T00:00:00Z'),
      ],
      undefined,
      EMPTY_WORKERS,
    );

    expect(rows.map((row) => row.title)).toEqual(['sooner', 'later', 'undated']);
  });

  it('マイルストーンの付いていない課題は、最後の 1 束にまとめる', () => {
    const rows = buildMilestones(
      [withMilestone('#1', null, null), withMilestone('#2', 'v1.0', null)],
      undefined,
      EMPTY_WORKERS,
    );

    expect(
      rows.map((row) => row.title),
      '名前が無いことを名前で表さない',
    ).toEqual(['v1.0', null]);
  });

  it('手元に生きているブランチだけを並べる', () => {
    const closing = withMilestone('#1', 'v1.0', null, {
      github: {
        pull_requests: [
          {
            number: 7,
            state: 'OPEN',
            is_draft: false,
            review_decision: null,
            head_ref_name: 'alive',
          },
          {
            number: 8,
            state: 'MERGED',
            is_draft: false,
            review_decision: null,
            head_ref_name: 'gone',
          },
        ],
      },
    } as Partial<IssueSummaryJson>);

    const join = {
      tips: new Map([['alive', {}]]),
      conflicts: new Map(),
      byBranch: new Map(),
      pullByBranch: new Map(),
    } as unknown as WorkJoin;

    const rows = buildMilestones([closing], join, EMPTY_WORKERS);

    expect(rows[0]?.branches, '押しても何も無い名前を並べない').toEqual(['alive']);
  });
});

describe('ブランチからマイルストーンを引く', () => {
  it('その PR が閉じる課題を経由して数える', () => {
    const on = withMilestone('#1', 'v1.0', null, {
      github: {
        pull_requests: [
          {
            number: 7,
            state: 'OPEN',
            is_draft: false,
            review_decision: null,
            head_ref_name: 'feat',
          },
        ],
      },
    } as Partial<IssueSummaryJson>);
    const off = withMilestone('#2', 'v2.0', null);

    expect(milestonesOnBranch('feat', [on, off])).toEqual(['v1.0']);
  });

  it('マイルストーンの付いていない課題からは何も出ない', () => {
    expect(milestoneOf(withMilestone('#1', null, null))).toBeNull();
  });
});
