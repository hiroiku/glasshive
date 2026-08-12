import { describe, expect, it } from 'vitest';
import {
  branchStateOf,
  buildWorkJoin,
  issueBranchOf,
  issuesByBranch,
  tipIndex,
} from '~/frameworks/tanstack/ui/derive/workJoin.ts';

/* 課題とブランチを結ぶ。

   **繋ぎ目は PR の `head_ref_name` 1 本だけである。** 名前が一致したときだけ結ぶ ——
   似た名前を寄せると、別のブランチの遅れを課題の欄に出すことになる。 */

/* `git` と課題の形は、突き合わせる実装そのものから引く。写して持てば、形が変わったときに
   片方だけ古いまま残る。 */
type GitOverview = NonNullable<Parameters<typeof tipIndex>[0]>;
type Tip = GitOverview['tips'][number];
type Conflict = GitOverview['conflicts'][number];
type Issue = Parameters<typeof issuesByBranch>[0][number];

const tip = (name: string, over: Partial<Tip> = {}): Tip => ({
  kind: 'branch',
  name,
  sha: `sha-${name}`,
  date: '2026-08-09T12:00:00Z',
  subject: name,
  worktree: null,
  merge_base: 'base',
  ahead: 0,
  behind: 0,
  ...over,
});

const conflict = (a: string, b: string): Conflict => ({ a, b, n: 1, files: ['src/x.ts'] });

const git = (over: Partial<GitOverview> = {}): GitOverview => ({
  state: 'observed',
  reason: null,
  base: 'main',
  worktrees: [],
  branches: [],
  mainline: [],
  mainline_truncated: false,
  tips: [],
  conflicts: [],
  ...over,
});

const issue = (id: string, branches: readonly (string | null)[] = []): Issue => ({
  id,
  title: id,
  status: 'open',
  issue_type: null,
  labels: [],
  assignee: null,
  created_at: null,
  updated_at: null,
  closed_at: null,
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
    pull_requests: branches.map((head, at) => ({
      number: at + 1,
      state: 'OPEN',
      is_draft: false,
      review_decision: null,
      head_ref_name: head,
    })),
    comments: 0,
    reactions: 0,
  },
});

/* 衝突のインデックスは外へ出ていないので、まとめて組む側から取る。
   課題の側から見える形は、こう組んだときのものだけである。 */
const stateOf = (overview: GitOverview | null, target: Issue, others: readonly Issue[] = []) => {
  const join = buildWorkJoin(overview, 'observed', [target, ...others]);
  return branchStateOf(target, join.tips, join.conflicts);
};

describe('ブランチ名から `tip` を引く', () => {
  it('同じ名前で 2 本来たら、worktree の側を採る', () => {
    const index = tipIndex(
      git({
        tips: [
          tip('feat/x-1', { ahead: 1 }),
          tip('feat/x-1', { kind: 'worktree', worktree: '/repo/.worktrees/x-1', ahead: 3 }),
        ],
      }),
    );

    expect(index.get('feat/x-1')?.worktree, '実際に人が居るのは worktree の側である').toBe(
      '/repo/.worktrees/x-1',
    );
    expect(index.size, '2 本来ても、ブランチは 1 本である').toBe(1);
  });

  it('worktree を先に見ていても、branch では上書きしない', () => {
    const index = tipIndex(
      git({
        tips: [
          tip('feat/x-1', { kind: 'worktree', worktree: '/repo/.worktrees/x-1' }),
          tip('feat/x-1'),
        ],
      }),
    );

    expect(index.get('feat/x-1')?.kind, '見た順で採る側が変わってはいけない').toBe('worktree');
  });

  it('`git` を観測できていなければ、空', () => {
    expect(tipIndex(null).size).toBe(0);
  });
});

describe('課題の側から見たブランチの状態', () => {
  it('PR のブランチ名が `tips` に在れば、進み具合と worktree を返す', () => {
    const state = stateOf(
      git({
        tips: [
          tip('feat/x-1', { ahead: 4, behind: 2, kind: 'worktree', worktree: '/repo/wt/x-1' }),
        ],
      }),
      issue('#7', ['feat/x-1']),
    );

    expect(state).toEqual({
      name: 'feat/x-1',
      ahead: 4,
      behind: 2,
      worktree: '/repo/wt/x-1',
      conflictsWith: [],
    });
  });

  /* 名前を寄せると、別のブランチの遅れを課題の欄に出すことになる。 */
  it('名前の似ているところから探しに行かない', () => {
    const state = stateOf(
      git({ tips: [tip('feat/kuden-os-4f2a-2'), tip('kuden-os-4f2a')] }),
      issue('#7', ['feat/kuden-os-4f2a']),
    );

    expect(state, '前方一致も部分一致も、一致ではない').toBe(null);
  });

  it('課題の id がブランチ名に入っていても、PR が無ければ結ばない', () => {
    const state = stateOf(git({ tips: [tip('feat/kuden-os-4f2a')] }), issue('kuden-os-4f2a'));

    expect(state, 'id をブランチ名に含めない運用も同じくらい在る').toBe(null);
  });

  it('GitHub の欄が無い課題は、結ばない', () => {
    expect(stateOf(git({ tips: [tip('feat/x-1')] }), issue('#7'))).toBe(null);
  });

  it('`head_ref_name` が `null` の PR は飛ばして、次の PR を見る', () => {
    const state = stateOf(
      git({ tips: [tip('feat/x-1', { ahead: 5 })] }),
      issue('#7', [null, 'feat/x-1']),
    );

    expect(state?.name, 'ブランチ名を持たない PR で打ち切ると、結べる PR を見落とす').toBe(
      'feat/x-1',
    );
  });

  it('`tips` に無いブランチ名の PR も飛ばして、次の PR を見る', () => {
    const state = stateOf(
      git({ tips: [tip('feat/x-1')] }),
      issue('#7', ['deleted-branch', 'feat/x-1']),
    );

    expect(state?.name).toBe('feat/x-1');
  });

  it('`git` を観測できていなければ、結ばない', () => {
    expect(stateOf(null, issue('#7', ['feat/x-1']))).toBe(null);
  });
});

describe('同じファイルを触っている相手', () => {
  const overview = git({
    tips: [tip('feat/a'), tip('feat/b')],
    conflicts: [conflict('feat/a', 'feat/b')],
  });

  it('どちらの側から引いても、相手が出る', () => {
    const a = stateOf(overview, issue('#1', ['feat/a']));
    const b = stateOf(overview, issue('#2', ['feat/b']));

    expect(a?.conflictsWith, '衝突は向きを持たない').toEqual(['feat/b']);
    expect(b?.conflictsWith).toEqual(['feat/a']);
  });

  it('同じ相手を二度並べない', () => {
    const both = git({
      tips: [tip('feat/a'), tip('feat/b')],
      conflicts: [conflict('feat/a', 'feat/b'), conflict('feat/b', 'feat/a')],
    });

    expect(stateOf(both, issue('#1', ['feat/a']))?.conflictsWith).toEqual(['feat/b']);
  });

  it('衝突していないブランチは、空のまま', () => {
    const state = stateOf(git({ tips: [tip('feat/c')] }), issue('#3', ['feat/c']));

    expect(state?.conflictsWith).toEqual([]);
  });
});

describe('ブランチ名から課題を引く', () => {
  it('1 本のブランチが複数の課題を閉じても、取りこぼさない', () => {
    const index = issuesByBranch([issue('#1', ['feat/x']), issue('#2', ['feat/x'])]);

    expect(
      index.get('feat/x')?.map((found) => found.id),
      '後から来た課題で上書きすると、閉じる課題が画面から消える',
    ).toEqual(['#1', '#2']);
  });

  it('1 件の課題が複数の PR を持てば、どちらのブランチからも引ける', () => {
    const index = issuesByBranch([issue('#1', ['feat/x', 'feat/y'])]);

    expect(index.get('feat/x')?.[0]?.id).toBe('#1');
    expect(index.get('feat/y')?.[0]?.id).toBe('#1');
  });

  it('`head_ref_name` が `null` の PR は、鍵を増やさない', () => {
    const index = issuesByBranch([issue('#1', [null])]);

    expect(index.size, '空の鍵を作ると、そこから全員が引けてしまう').toBe(0);
  });

  it('GitHub の欄が無い課題は、鍵を増やさない', () => {
    expect(issuesByBranch([issue('#1')]).size).toBe(0);
  });
});

describe('突き合わせのインデックスをまとめて組む', () => {
  it('`git` を観測できていなくても、課題の側は引ける', () => {
    const join = buildWorkJoin(null, 'observed', [issue('#1', ['feat/x'])]);

    expect(join.tips.size).toBe(0);
    expect(join.conflicts.size).toBe(0);
    expect(
      join.byBranch.get('feat/x'),
      '片側が観測できなくても、もう片側は落とさない',
    ).toHaveLength(1);
  });
});

describe('ブランチ名から PR を引く', () => {
  /** 状態の違う PR を、同じブランチに 2 本ぶら下げる */
  const withPulls = (
    id: string,
    pulls: readonly { number: number; state: string }[],
    head: string,
  ): Issue => {
    const base = issue(id, [head]);
    return {
      ...base,
      github: {
        ...base.github,
        pull_requests: pulls.map((pull) => ({
          number: pull.number,
          state: pull.state,
          is_draft: false,
          review_decision: null,
          head_ref_name: head,
        })),
      },
    };
  };

  it('開いている PR を先に採る', () => {
    const join = buildWorkJoin(null, 'observed', [
      withPulls(
        '#1',
        [
          { number: 7, state: 'CLOSED' },
          { number: 9, state: 'OPEN' },
        ],
        'feat/x',
      ),
    ]);

    expect(
      join.pullByBranch.get('feat/x')?.number,
      '閉じたほうを出すと、いま動いている作業が終わったものに見える',
    ).toBe(9);
  });

  it('開いているものが無ければ、最初に見つけたものを出す', () => {
    const join = buildWorkJoin(null, 'observed', [
      withPulls(
        '#1',
        [
          { number: 7, state: 'MERGED' },
          { number: 9, state: 'CLOSED' },
        ],
        'feat/x',
      ),
    ]);

    expect(join.pullByBranch.get('feat/x')?.number).toBe(7);
  });

  it('ブランチ名の無い PR は、どのブランチにも結ばない', () => {
    const join = buildWorkJoin(null, 'observed', [issue('#1', [null])]);

    expect(join.pullByBranch.size, '名前が無いものを推測で結ばない').toBe(0);
  });
});

/* 手元の git を観測できていないとき。**PR が名指しているブランチを、無いことにしない。**

   PR は GitHub から読めているので、ブランチの名前は分かっている。分からないのは手元での遅れと
   衝突のほうで、そこを `null` に潰すと、行からは何も消えていないように見える。 */
describe('手元の git を観測できていないとき', () => {
  const withPull = issue('#1', ['feat/x']);
  const withoutPull = issue('#2', []);

  it.each(['pending', 'unobservable'] as const)('%s なら、名前だけを運ぶ', (reach) => {
    const found = issueBranchOf(withPull, buildWorkJoin(null, reach, [withPull]));

    expect(found, '観測できていないことを、ブランチが無いことにしない').toEqual({
      kind: 'unread',
      name: 'feat/x',
      reach,
    });
  });

  /* PR が 1 つも無い課題には、そもそもブランチの欄が出ない。ここでチップを出すと、
     観測できていないことが、全部の行に付く飾りになる */
  it('PR を持たない課題には、何も運ばない', () => {
    expect(issueBranchOf(withoutPull, buildWorkJoin(null, 'unobservable', [withoutPull]))).toBe(
      null,
    );
  });

  it('観測できていれば、これまで通り手元の状態を運ぶ', () => {
    const overview = git({ tips: [tip('feat/x', { ahead: 2, behind: 1 })] });
    const found = issueBranchOf(withPull, buildWorkJoin(overview, 'observed', [withPull]));

    expect(found?.kind).toBe('observed');
    expect(found?.kind === 'observed' && found.branch.behind).toBe(1);
  });

  /* git のリポジトリでないディレクトリにブランチが 0 本なのは、観測して言える事実である。
     ここまで `unread` にすると、言えることまで言えないことになる */
  it('git のリポジトリでなければ、ブランチが無いと言い切る', () => {
    expect(issueBranchOf(withPull, buildWorkJoin(null, 'observed', [withPull]))).toBe(null);
  });
});
