import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_COLUMN_IDS,
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

/* 検索の問い合わせはサーバー側のコードを連れてくる。中身の検索は常に走るので、
   ここで返事を差し替えて、画面の側だけを見る */
const { fetchSearch } = vi.hoisted(() => ({ fetchSearch: vi.fn() }));

vi.mock('~/frameworks/tanstack/queries/sessions.query.ts', () => ({ fetchSearch }));

/** メッセージの問い合わせも同じく、返事だけを差し替える */
const { messagesQuery } = vi.hoisted(() => ({ messagesQuery: vi.fn() }));

vi.mock('~/frameworks/tanstack/queries/messages.query.ts', () => ({ messagesQuery }));

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

function session(
  id: string,
  subagents: SubagentJson[],
  extra: Partial<SessionJson> = {},
): SessionJson {
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
    issues: [],
    current: null,
    intervals: [],
    intervals_complete: true,
    intervals_state: 'observed',
    size: 0,
    sources: { state: 'observed', reason: null },
    subagents,
    ...extra,
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
    read: true,
    sources: { state: 'observed', reason: null },
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

/** メッセージの返事を 1 つ据える。矢印を出す操作を押すまで頼まれない */
const answerMessages = (body: Record<string, unknown>) => {
  messagesQuery.mockReturnValue({
    queryKey: ['messages', JSON.stringify(body)],
    queryFn: () => Promise.resolve({ ok: true, body }),
  });
};

/** ツールバーのチップを、出ている文字で選ぶ */
const chipOf = (text: string): HTMLElement => {
  const found = [...document.querySelectorAll('.view-toolbar .fchip')].find((chip) =>
    (chip.textContent ?? '').startsWith(text),
  );
  if (found === undefined) throw new Error(`no chip is showing ${text}`);
  return found as HTMLElement;
};

beforeEach(() => {
  fetchSearch.mockReset();
  // 中身の当たりが 1 つも無い、読み切った答え
  fetchSearch.mockResolvedValue({
    ok: true,
    body: { state: 'observed', reason: null, files: [], scanned: 0, total: 0, done: true },
  });
  messagesQuery.mockReset();
  answerMessages({ state: 'observed', reason: null, complete: true, unplaced: 0, hops: [] });
});

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

/* 見出しの一致は即座に、中身の一致は読み進むにつれて。**足すのであって、置き換えない。** */
describe('見出しの一致と、`transcript` の中身の一致を足し合わせる', () => {
  it('中身を読み終える前でも、見出しで当たった行は出ている', () => {
    mount({ project: three, query: 'grandchild' });

    expect(labels(), '中身を読むあいだ、見出しの一致が消えてはいけない').toEqual([
      'sess',
      'grandchild',
    ]);
  });

  it('見出しでは当たらない行も、中身が当たれば足される', async () => {
    fetchSearch.mockResolvedValue({
      ok: true,
      body: {
        state: 'observed',
        reason: null,
        files: ['/x/child.jsonl'],
        scanned: 3,
        total: 3,
        done: true,
      },
    });

    mount({ project: three, query: 'needle' });
    expect(labels(), '中身を読む前は、見出しで当たった行だけが出る').toEqual([]);

    await waitFor(() => expect(labels()).toEqual(['sess', 'child']), { timeout: 2000 });
  });

  it('読んでいる途中は、どこまで見たかを出す', async () => {
    fetchSearch.mockResolvedValue({
      ok: true,
      body: { state: 'observed', reason: null, files: [], scanned: 8, total: 40, done: false },
    });

    mount({ project: three, query: 'needle' });

    await waitFor(
      () => expect(document.querySelector('.deep-note')?.textContent).toBe('8 / 40 transcripts'),
      { timeout: 2000 },
    );
  });

  it('読み切ったら、進み具合は消える', async () => {
    mount({ project: three, query: 'needle' });

    await waitFor(() => expect(fetchSearch).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(document.querySelector('.deep-note')).toBeNull());
  });
});

/* 消費が空欄なのは、0 だったからかもしれないし、読めなかったからかもしれない。
 **同じ空欄にすると、その 2 つが画面の上で 1 つになる。** */
describe('読めなかった消費を、0 と同じ空欄にしない', () => {
  const tokensOf = (label: string): string =>
    rowOf(label).querySelector('.col-tok .mono')?.textContent ?? '';

  it('読めなかった消費は `?` で言う', () => {
    mount({
      project: project([session('sess', [], { tokens: null, tokens_state: 'unobservable' })]),
    });

    expect(tokensOf('sess'), '読めなかったことが、使わなかったことと同じに見えている').toBe('?');
  });

  it('読めなかったことは、ホバーしたときにも言う', () => {
    mount({
      project: project([session('sess', [], { tokens: null, tokens_state: 'unobservable' })]),
    });

    expect(rowOf('sess').querySelector('.col-tok')?.getAttribute('title')).toContain(
      'Could not be read',
    );
  });

  it('読み取り範囲の外だっただけの行は、空欄のままにする', () => {
    mount({ project: project([session('sess', [], { tokens: null, tokens_state: 'absent' })]) });

    expect(tokensOf('sess'), '無かったことを、読めなかったことにしない').toBe('');
  });

  it('読めなかった行には、割合のバーを引かない', () => {
    mount({
      project: project([session('sess', [], { tokens: null, tokens_state: 'unobservable' })]),
    });

    expect(rowOf('sess').querySelectorAll('.tok-bar i')).toHaveLength(0);
  });
});

/* メッセージを走査できなかったセッションは、presenter からも空で返る。
 **空をそのまま数えると「一度も話さなかった」になる。** */
describe('メッセージを観測できなかったことを、0 通と言わない', () => {
  it('読めなかった回は `?` を出す', async () => {
    answerMessages({
      state: 'unobservable',
      reason: 'EACCES',
      complete: false,
      unplaced: 0,
      hops: [],
    });
    mount({ project: three });

    fireEvent.click(chipOf('⇄ messages'));

    await waitFor(
      () =>
        expect(chipOf('⇄').textContent, '走査に失敗したセッションが 0 通と名乗っている').toBe(
          '⇄ ?',
        ),
      { timeout: 2000 },
    );
    expect(chipOf('⇄').getAttribute('title')).toContain('could not be read');
  });

  it('読み取り範囲が先頭まで届かなかった回は、数がそこまでだと言う', async () => {
    answerMessages({ state: 'observed', reason: null, complete: false, unplaced: 0, hops: [] });
    mount({ project: three });

    fireEvent.click(chipOf('⇄ messages'));

    await waitFor(() =>
      expect(
        chipOf('⇄').getAttribute('title'),
        '数えた範囲の外を、無かったことにしている',
      ).toContain('older than the scan window'),
    );
    expect(chipOf('⇄').textContent).toBe('⇄ ≥0');
  });

  it('先頭まで読み切った回は、数をそのまま出す', async () => {
    mount({ project: three });

    fireEvent.click(chipOf('⇄ messages'));

    await waitFor(() => expect(chipOf('⇄').textContent).toBe('⇄ 0'));
  });
});

/* 目盛りは列の中に収まらなければならない。中央寄せのままだと、左端のラベルは
   並べ替えの ▲ と隣の列へはみ出す。 */
describe('軸の両端の目盛りを、列の中へ寄せる', () => {
  const ticks = () => [...document.querySelectorAll('.tl-head .tick')];
  /** 目盛りが何本も置ける幅の軸を作る。1 分の軸では両端しか置けない */
  const spanned = project([
    session('long', [], { started: new Date(NOW - 6 * 3_600_000).toISOString() }),
  ]);

  it('左端の目盛りに `first`、右端に `last` が出る', () => {
    mount({ project: spanned });
    const shown = ticks();

    expect(shown.length, '目盛りが 2 つ以上出ていないと、両端を見分けられない').toBeGreaterThan(1);
    expect(shown[0]?.className, '左端のラベルが列の外へはみ出している').toContain('first');
    expect(shown.at(-1)?.className).toContain('last');
  });

  it('間の目盛りは、どちらの寄せも受けない', () => {
    mount({ project: spanned });

    for (const tick of ticks().slice(1, -1)) {
      expect(tick.className).toBe('tick');
    }
  });

  /* インラインの宣言は `!important` の無い規則に必ず勝つ。位置を `left` で直に渡すと、
     並べ替えの ▲ を避ける底上げが一度も効かない。 */
  it('目盛りの位置は、CSS 変数で渡す', () => {
    mount({ project: spanned, sorting: [{ id: 'timeline', desc: false }] });
    const first = ticks()[0] as HTMLElement;

    expect(first.style.left, 'インラインの `left` が、▲ を避ける底上げに勝っている').toBe('');
    expect(first.style.getPropertyValue('--tick-x')).toMatch(/%$/);
  });
});

/* URL の `sort` は画面を移っても持ち越される。表に無い名前をそのまま渡すと、TanStack が
   知らない列を黙って捨て、既定の並びごと落ちる。 */
describe('並べ替えの名前を、表が持つ列と結ぶ', () => {
  const headers = () => [...document.querySelectorAll('.head [role="columnheader"]')];

  it('挙げた名前の数だけ、列が出ている', () => {
    mount({ project: three });

    expect(headers()).toHaveLength(AGENT_COLUMN_IDS.length);
  });

  it('挙げた名前は、どれも並べ替えの効く列を指す', () => {
    for (const id of AGENT_COLUMN_IDS) {
      const { unmount } = mount({ project: three, sorting: [{ id, desc: false }] });
      const sorted = headers().filter((header) => header.getAttribute('aria-sort') !== 'none');

      expect(sorted, `\`${id}\` に当たる列が無く、既定の並びごと落ちる`).toHaveLength(1);
      unmount();
    }
  });
});

/* 行を `button` にすると、ARIA の決まりで中身が読み上げから消える。 */
describe('行の中身を、支援技術に渡す', () => {
  it('表として並び、行は 11 個のセルを持つ', () => {
    mount({ project: three });

    expect(document.querySelector('#tree-pane')?.getAttribute('role')).toBe('grid');
    expect(
      rowOf('sess').querySelectorAll('[role="gridcell"]'),
      '行の中身が、行の名前 1 つに置き換わっている',
    ).toHaveLength(11);
  });

  it('行そのものは名前を名乗らない', () => {
    mount({ project: three });
    const row = rowOf('sess');

    expect(row.getAttribute('role')).toBe('row');
    expect(row.getAttribute('aria-label'), '名前を持つと、中の 11 個のセルが消える').toBeNull();
    expect(row.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('開く操作の説明は、どの行からも辿れる 1 つに置く', () => {
    mount({ project: three });
    const id = rowOf('sess').getAttribute('aria-describedby') ?? '';

    expect(document.getElementById(id)?.textContent).toContain('open the conversation');
  });

  it('列の見出しは、いまどう並んでいるかを名乗る', () => {
    mount({ project: three, sorting: [{ id: 'state', desc: false }] });
    const headers = [...document.querySelectorAll('.head [role="columnheader"]')];

    expect(headers).toHaveLength(11);
    const sorted = headers.filter((header) => header.getAttribute('aria-sort') !== 'none');
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('見出しはキーボードからも並べ替えられる', () => {
    const onSorting = vi.fn();
    mount({ project: three, sorting: [{ id: 'state', desc: false }], onSorting });
    const header = document.querySelectorAll('.head [role="columnheader"]')[1];

    fireEvent.keyDown(header as HTMLElement, { key: 'Enter' });

    expect(onSorting).toHaveBeenCalled();
  });

  /* `grid` が持てるのは `row` と `rowgroup` だけである。列を持たないものを中に置くと、
     読み上げは表として辿れなくなる。 */
  it('表の直の子は、行と行の束だけにする', () => {
    mount({ project: three });
    const pane = document.querySelector('#tree-pane');

    expect([...(pane?.children ?? [])].map((child) => child.getAttribute('role'))).toEqual([
      'row',
      'rowgroup',
    ]);
  });

  it('ツールバーと、開く操作の説明は、表の外に置く', () => {
    mount({ project: three });
    const hint = rowOf('sess').getAttribute('aria-describedby') ?? '';

    expect(
      document.querySelector('.view-toolbar'),
      'ツールバーそのものが消えている',
    ).not.toBeNull();
    expect(document.querySelector('#tree-pane .view-toolbar')).toBeNull();
    expect(document.getElementById(hint)?.closest('#tree-pane') ?? null).toBeNull();
  });

  it('開いている行は、選ばれていると名乗る', () => {
    mount({ project: three, selectedFile: '/x/sess.jsonl' });

    expect(rowOf('sess').getAttribute('aria-selected')).toBe('true');
    expect(rowOf('child').getAttribute('aria-selected')).toBe('false');
  });

  it('畳める行は、開いているかどうかを名乗る', () => {
    mount({ project: three });

    expect(rowOf('sess').getAttribute('aria-expanded')).toBe('true');
    expect(rowOf('grandchild').getAttribute('aria-expanded')).toBeNull();
  });
});

/* `.worktrees/<名前>` から拾った名前は GitHub の課題の id ではない。 */
describe('取り組んでいる先を、押しどころにしない', () => {
  const working = project([session('sess', [], { issues: ['issue-101'] })]);

  it('worktree の名前は、押せない文字として出す', () => {
    mount({ project: working });
    const cell = rowOf('sess').querySelector('.col-work');

    expect(cell?.textContent).toBe('issue-101');
    expect(
      cell?.querySelectorAll('button'),
      '押しても開く先が無いものを押しどころにしている',
    ).toHaveLength(0);
  });

  it('ハイライトの突き合わせに使う語は、行に残す', () => {
    mount({ project: working });

    expect(rowOf('sess').getAttribute('data-tok')).toContain('issue-101');
  });
});

/* 稼働を観測できなかった行を、続いた 1 本の稼働として描かない。 */
describe('稼働を観測できなかったことを、表からも渡す', () => {
  it('観測できなかった行には、稼働の棒を引かない', () => {
    mount({
      project: project([
        session('sess', [], { intervals: [], intervals_state: 'unobservable', state: 'ended' }),
      ]),
    });
    const bars = [...rowOf('sess').querySelectorAll('.tl .bar')];

    expect(bars.filter((bar) => !bar.classList.contains('unknown'))).toEqual([]);
    expect(bars[0]?.getAttribute('title')).toContain('could not be read');
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
