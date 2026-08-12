import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function project(sessions: SessionJson[], extra: Partial<ProjectJson> = {}): ProjectJson {
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
    ...extra,
  };
}

function mount(overrides: Partial<AgentsTableProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: AgentsTableProps = {
    project: project([]),
    showAll: true,
    onShowAll: vi.fn(),
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
  answerMessages({
    state: 'observed',
    reason: null,
    complete: true,
    unplaced: 0,
    peers: [],
    hops: [],
  });
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
      () =>
        expect(document.querySelector('.deep-note')?.textContent).toBe('8 of 40 transcripts read'),
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
      peers: [],
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
    answerMessages({
      state: 'observed',
      reason: null,
      complete: false,
      unplaced: 0,
      peers: [],
      hops: [],
    });
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
  // 幅を差し替えた例が在るので、次の例へ持ち越さない
  afterEach(() => vi.restoreAllMocks());

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

  /* 列がラベルを置ける幅を持っていれば、端の目盛りも中央寄せのままで収まる。そこまで
     寄せると隣のラベルへ寄って行き、`18:00` と `19:00` がくっついて 1 つの語に見える。 */
  it('列の中に収まる目盛りは、端でも寄せない', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 26,
        width: 1200,
        height: 26,
        toJSON: () => ({}),
      } as DOMRect;
    });
    mount({ project: spanned });

    await waitFor(() => {
      const shown = ticks();
      expect(shown.length).toBeGreaterThan(1);
      expect(shown[0]?.className, '収まるのに左端へ寄せている').toBe('tick');
    });
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

  /* 並べ替えられる列は `columnheader` と `button` の入れ子である。**片方に寄せない** ——
     `columnheader` が押しどころを兼ねると「押せる」ことが読み上げから消え、`button` だけに
     すると `aria-sort` を置く先が無くなる。 */
  it('見出しの押しどころは、`columnheader` の中の `button` である', () => {
    mount({ project: three });

    for (const header of document.querySelectorAll('.head [role="columnheader"]')) {
      expect(
        header.querySelector('button.sortable'),
        '押せることが、支援技術のどこにも出ていない',
      ).not.toBeNull();
    }
  });

  it('見出しそのものは、押しどころを名乗らない', () => {
    mount({ project: three });

    for (const header of document.querySelectorAll('.head [role="columnheader"]')) {
      expect(header.getAttribute('tabindex'), '同じ場所にタブ順が 2 つ在る').toBeNull();
      expect(header.getAttribute('role')).toBe('columnheader');
    }
  });

  /* 時間軸の列だけは、見出しの中身が語ではなく目盛りの時刻である。列が狭くて目盛りが
     1 本も残らないときは、名前を持たない押しどころになる。 */
  it('時間軸の列も、名前を名乗る', () => {
    mount({ project: three });
    const headers = [...document.querySelectorAll('.head [role="columnheader"]')];
    const timeline = headers.find((header) => header.querySelector('.tl-head') !== null);

    expect(timeline?.getAttribute('aria-label')).toBe('Timeline');
    expect(timeline?.querySelector('button')?.getAttribute('aria-label')).toBe('Timeline');
  });

  it('見出しの `button` を押すと並べ替わる', () => {
    const onSorting = vi.fn();
    mount({ project: three, sorting: [{ id: 'state', desc: false }], onSorting });
    const button = document.querySelectorAll('.head [role="columnheader"] button')[1];

    fireEvent.click(button as HTMLElement);

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

/* 走査できなかったプロジェクトの `sessions` は空のまま届く。**空をそのまま数えると
   「セッションを 1 つも持たないプロジェクト」になる。** 同じページの統計フッターは同じ
   `sources` を読んで観測できなかったと言うので、ここで断定すると言うことが食い違う。 */
describe('空の表が、観測できなかったことを断定しない', () => {
  const note = (): string => document.querySelector('#rows .empty')?.textContent ?? '';

  it('走査できなかったプロジェクトで、セッションが無かったと言わない', () => {
    mount({ project: project([], { sources: { state: 'unobservable', reason: 'EACCES' } }) });

    expect(note(), '観測できなかったことが、無かったことになっている').not.toBe(
      'No sessions to show',
    );
    expect(note()).toContain('could not be counted');
  });

  it('走査できて 1 つも無かったときは、無かったと言う', () => {
    mount({ project: project([]) });

    expect(note()).toBe('No sessions to show');
  });

  it('ディレクトリが無かったことと、走査できなかったことを別の文にする', () => {
    mount({ project: project([], { sources: { state: 'absent', reason: 'ENOENT' } }) });

    expect(note(), '「無かった」と「観測できなかった」が同じ文になっている').not.toContain(
      'could not be counted',
    );
    expect(note()).toContain('not there');
  });

  it('まだ読んでいないプロジェクトを、セッションの無いプロジェクトにしない', () => {
    mount({ project: project([], { read: false }) });

    expect(note(), 'まだ観測していないことが、無かったことになっている').not.toBe(
      'No sessions to show',
    );
  });

  it('絞り込んで何も残らなかったことは、1 つも無いことと別に言う', () => {
    mount({ project: project([session('sess', [])]), query: 'needle' });

    expect(note()).toContain('No matching sessions');
  });

  it('走査できなかったプロジェクトでは、絞り込みの分母も断定しない', () => {
    mount({
      project: project([session('sess', [])], {
        sources: { state: 'unobservable', reason: 'EACCES' },
      }),
      query: 'needle',
    });

    expect(note(), '数え上げられていない総数を、これで全部だと言っている').toContain('+?');
  });

  it('子を歩けなかったセッションを、子の居ないセッションに見せない', () => {
    mount({
      project: project([
        session('sess', [], { sources: { state: 'unobservable', reason: 'EACCES' } }),
      ]),
    });

    expect(
      rowOf('sess').querySelector('.name')?.textContent,
      '数え損ねた子が、居なかったことになっている',
    ).toContain('+?');
  });

  it('子を歩けたセッションには、何も添えない', () => {
    mount({ project: project([session('sess', [])]) });

    expect(rowOf('sess').querySelector('.name')?.textContent).not.toContain('+?');
  });
});

/* 矢印は `#rows` の上に重ねる。**`role="presentation"` は子に継がれない** ので、面だけを
   役から外しても、中の押しどころは `rowgroup` の直下に `row` を挟まずに残る。 */
describe('メッセージの矢印を、行の束の中へ浮かせない', () => {
  afterEach(() => vi.restoreAllMocks());

  /** happy-dom は幅を持たない。時間の列に幅を与えて、矢印を実際に描かせる */
  const widen = () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const height = this.classList.contains('tl') ? 14 : 26;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 400,
        bottom: height,
        width: 400,
        height,
        toJSON: () => ({}),
      } as DOMRect;
    });
  };

  /** 矢印が 1 本描かれた画面を作る */
  const drawn = async () => {
    widen();
    answerMessages({
      state: 'observed',
      reason: null,
      complete: true,
      unplaced: 0,
      peers: [],
      hops: [
        {
          at: new Date(NOW - 30_000).toISOString(),
          from: 'sess',
          to: 'child',
          summary: 'go',
          tool_use: 't1',
        },
      ],
    });
    mount({ project: three });

    fireEvent.click(chipOf('⇄ messages'));

    await waitFor(() => expect(document.querySelectorAll('.tl-msg .msg')).toHaveLength(1), {
      timeout: 2000,
    });
  };

  it('矢印の面は、中の要素ごと読み上げから外す', async () => {
    await drawn();

    expect(document.querySelector('.tl-msg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('行の束の中に、行でない押しどころを残さない', async () => {
    await drawn();

    expect(
      document.querySelectorAll('#rows [role="button"]'),
      '`rowgroup` の直下に `row` を挟まずに押しどころが浮いている',
    ).toHaveLength(0);
  });

  it('読み上げから外したものに、タブ順を残さない', async () => {
    await drawn();

    expect(
      document.querySelectorAll('.tl-msg [tabindex]'),
      '辿り着けるのに読み上げられない場所が在る',
    ).toHaveLength(0);
  });

  it('矢印が開く会話は、送り手の行からも開ける', async () => {
    await drawn();
    nav.openConv.mockClear();

    fireEvent.keyDown(rowOf('sess'), { key: 'Enter' });

    expect(
      nav.openConv,
      '矢印を隠した先に、同じ操作へキーボードで届く入口が無い',
    ).toHaveBeenCalledWith('/x/sess.jsonl');
  });

  /* 面ごと隠したのは正しいが、`aria-label` が運んでいた「どの組がいつ何を話したか」の
     行き先がどこにも無かった。集計はツールバーのチップに残っても、1 本ずつの中身は残らない。 */
  it('矢が語っていた中身を、送り手の行に読み上げ用の文字として残す', async () => {
    await drawn();

    expect(rowOf('sess').textContent, '矢を隠した先に、話した相手と要約の行き先が無い').toContain(
      'sess → child · go',
    );
  });

  it('矢を送っていない行には、何も足さない', async () => {
    await drawn();

    expect(rowOf('child').querySelector('.vhidden')).toBeNull();
  });

  it('行の束の直の子は、行か、読み上げから外したものだけにする', async () => {
    await drawn();

    for (const child of [...(document.querySelector('#rows')?.children ?? [])]) {
      const kept =
        child.getAttribute('role') === 'row' || child.getAttribute('aria-hidden') === 'true';
      expect(kept, `${child.getAttribute('class') ?? ''} が行の束の直下に浮いている`).toBe(true);
    }
  });

  /* 別のセッションとのやり取りは、こちら側の行しか置けない。**相手が「無い」のではなく
     「置いていない」。** 実線の矢と同じ顔で描くと、置いていない相手が置いた相手として読まれる。 */
  const withPeer = async (over: Record<string, unknown> = {}) => {
    widen();
    answerMessages({
      state: 'observed',
      reason: null,
      complete: true,
      unplaced: 0,
      hops: [],
      peers: [
        {
          at: new Date(NOW - 30_000).toISOString(),
          direction: 'received',
          agent: 'sess',
          peer: 'glasshive-clean-arch-port',
          msg_id: 'be3ecd13',
          summary: '',
          mode: 'prompting',
          ...over,
        },
      ],
    });
    mount({ project: three });

    fireEvent.click(chipOf('⇄ messages'));

    await waitFor(() => expect(document.querySelectorAll('.tl-msg .msg')).toHaveLength(1), {
      timeout: 2000,
    });
  };

  it('片端しか無いやり取りにも、マークを置く', async () => {
    await withPeer();

    expect(
      document.querySelectorAll('.tl-msg .msg.peer'),
      '置けない相手のぶんを描かないと、隣のセッションと話していたことが消える',
    ).toHaveLength(1);
  });

  it('実線の矢と同じ顔で描かない', async () => {
    await withPeer();

    expect(
      document.querySelector('.tl-msg .msg.peer .msg-line')?.getAttribute('class'),
      '同じ顔にすると、置いていない相手が置いた相手として読まれる',
    ).toContain('peer');
  });

  it('相手が自己申告した名前と、相手が居ないことを、その行に文字で残す', async () => {
    await withPeer();

    const said = rowOf('sess').textContent ?? '';
    expect(said).toContain('glasshive-clean-arch-port');
    expect(said, 'マークだけでは、相手がこの画面に居ないことが読めない').toContain(
      'not in this view',
    );
  });

  /* 自己申告した名前が無ければ、相手が誰かは分かっていない。空欄にすると、名乗った相手と同じに見える。 */
  it('名前を自己申告しなかったことを、空欄で済ませない', async () => {
    await withPeer({ peer: '' });

    expect(rowOf('sess').textContent).toContain('did not give a name');
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
