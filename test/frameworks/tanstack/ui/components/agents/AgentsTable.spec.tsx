import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentsTable,
  type AgentsTableProps,
} from '~/frameworks/tanstack/ui/components/agents/AgentsTable.tsx';

/* 委譲は深さ 1 では終わらない。子がまた子を呼び、実際に深さ 3 まで在る。

   **深さを潰すと、木は木でなくなる。** 孫が子と同じ深さに並べば、誰が誰に投げたのかは
   読めなくなり、親を折り畳んでも孫だけが親無しの行として残る。ここで見るのは、
   `depth` が字下げにも罫線にも届いていることと、折り畳みが下の代まで届くことである。 */

/* プロジェクトの形は、受け取る表そのものから引く。写し取ると、形が変わってもテストが気づけない */
type ProjectJson = AgentsTableProps['project'];
type SessionJson = ProjectJson['sessions'][number];
type SubagentJson = SessionJson['subagents'][number];

const nav = vi.hoisted(() => ({ openConv: vi.fn() }));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => nav,
}));

/* 検索の問い合わせはサーバー側のコードを連れてくる。deep を押していない限り呼ばれないので、
   形だけを置いて、画面の側だけを見る */
vi.mock('~/frameworks/tanstack/queries/sessions.query.ts', () => ({
  searchQuery: (projectId: string, query: string) => ({
    queryKey: ['search', projectId, query],
    queryFn: () => Promise.resolve(null),
  }),
}));

const NOW = Date.parse('2026-08-09T12:00:00Z');
const AT = new Date(NOW - 60_000).toISOString();

function subagent(
  id: string,
  depth: number,
  parent: string | null,
  extra: Partial<SubagentJson> = {},
): SubagentJson {
  return {
    id,
    label: id,
    agent_type: null,
    name: null,
    tool_use: null,
    parent,
    depth,
    file: `/x/${id}.jsonl`,
    state: 'active',
    started: AT,
    last_activity: AT,
    tokens: null,
    tokens_state: 'observed',
    model: null,
    effort: null,
    git_branch: null,
    cwd: null,
    issue: null,
    current: null,
    intervals: [],
    intervals_complete: true,
    intervals_state: 'observed',
    ...extra,
  };
}

function session(id: string, subagents: SubagentJson[]): SessionJson {
  return {
    id,
    file: `/x/${id}.jsonl`,
    title: id,
    state: 'active',
    awaiting: null,
    started: AT,
    last_activity: AT,
    tokens: null,
    tokens_state: 'observed',
    model: null,
    effort: null,
    git_branch: null,
    cwd: null,
    actor: null,
    issues: [],
    current: null,
    intervals: [],
    intervals_complete: true,
    intervals_state: 'observed',
    size: 0,
    subagents,
  };
}

function project(sessions: SessionJson[]): ProjectJson {
  return {
    id: 'hive',
    slug: 'hive',
    path: '/x',
    name: 'hive',
    live_process: true,
    live_process_count: 1,
    tokens_24h: null,
    tokens_24h_state: 'observed',
    sessions,
  };
}

function mount(overrides: Partial<AgentsTableProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: AgentsTableProps = {
    project: project([]),
    showAll: true,
    nowMs: NOW,
    selectedFile: null,
    firstPaint: true,
    query: '',
    onQuery: vi.fn(),
    attention: false,
    onAttention: vi.fn(),
    sorting: [],
    onSorting: vi.fn(),
    ...overrides,
  };
  return render(
    <QueryClientProvider client={client}>
      <AgentsTable {...props} />
    </QueryClientProvider>,
  );
}

const rowOf = (label: string): HTMLElement => {
  const name = [...document.querySelectorAll('.row .name .t')].find(
    (el) => el.textContent === label,
  );
  const row = name?.closest('.row') ?? null;
  if (row === null) throw new Error(`no row is showing ${label}`);
  return row as HTMLElement;
};

const indentOf = (label: string): string => {
  const name = rowOf(label).querySelector('.name');
  return name === null ? '' : (name as HTMLElement).style.paddingLeft;
};

const labels = (): string[] =>
  [...document.querySelectorAll('.row .name .t')].map((el) => el.textContent ?? '');

/** 親 → 子 → 孫。実データに在る深さ 3 をそのまま置く */
const three = project([
  session('sess', [
    subagent('child', 1, null, { agent_type: 'workflow-subagent' }),
    subagent('grandchild', 2, 'child', { agent_type: 'code-review' }),
  ]),
]);

describe('`depth` を、字下げと罫線の両方へ届ける', () => {
  it('孫は子より 1 階層ぶん深く字下げされる', () => {
    mount({ project: three });

    expect(indentOf('sess')).toBe('0px');
    expect(indentOf('child')).toBe('24px');
    expect(indentOf('grandchild'), '子と同じ字下げでは、誰に呼ばれた子か読めない').toBe('48px');
  });

  it('罫線を引く側にも同じ深さが渡る', () => {
    mount({ project: three });

    // 罫線の位置は CSS が --depth から計算する。行が `depth` を持たなければ深さ 1 に取り残される
    expect(rowOf('child').getAttribute('style')).toContain('--depth: 1');
    expect(rowOf('grandchild').getAttribute('style')).toContain('--depth: 2');
  });

  it('呼んだ相手が絞り込みで消えても、孫は消えず深さを保つ', () => {
    mount({ project: three, query: 'grandchild' });

    expect(labels(), '木から外すと、ユーザーには動いていない子にしか見えない').toEqual([
      'sess',
      'grandchild',
    ]);
    expect(indentOf('grandchild')).toBe('48px');
  });
});

describe('折り畳んだ親と一緒に、下の代まで隠れる', () => {
  it('子を折り畳むと孫も消える', () => {
    // 折り畳めるのは選んでいる行だけ。選んでいない行を押すと会話が開く
    mount({ project: three, selectedFile: '/x/child.jsonl' });
    expect(labels()).toEqual(['sess', 'child', 'grandchild']);

    fireEvent.click(rowOf('child'));

    expect(labels(), '孫だけが残ると、親の居ない行が並んでいるようにしか見えない').toEqual([
      'sess',
      'child',
    ]);
  });

  it('セッションを折り畳むと、代を問わず子が全部消える', () => {
    mount({ project: three, selectedFile: '/x/sess.jsonl' });

    fireEvent.click(rowOf('sess'));

    expect(labels()).toEqual(['sess']);
  });

  it('子を折り畳んでも、その子の兄弟は残る', () => {
    const tree = project([
      session('sess', [
        subagent('child', 1, null),
        subagent('grandchild', 2, 'child'),
        subagent('sibling', 1, null),
      ]),
    ]);
    mount({ project: tree, selectedFile: '/x/child.jsonl' });

    fireEvent.click(rowOf('child'));

    expect(labels()).toEqual(['sess', 'child', 'sibling']);
  });
});

describe('`agent_type` を名前の脇へ添える', () => {
  it('列を増やさずに、`agent_type` を薄く添える', () => {
    mount({ project: three });

    const child = rowOf('child');
    expect(child.querySelector('.name')?.textContent).toContain('workflow');
    // 11 本の subgrid を崩すと表全体の列が揃わなくなる
    expect(child.children.length).toBe(11);
  });

  it('切り詰めた表記の元は、ホバーしたときに見せる', () => {
    mount({ project: three });

    const chip = [...rowOf('child').querySelectorAll('.sub-id')].at(-1);
    expect(chip?.getAttribute('title')).toBe('workflow-subagent');
  });
});
