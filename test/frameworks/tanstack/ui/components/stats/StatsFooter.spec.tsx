import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { getUsage } from '~/frameworks/tanstack/functions/usage.ts';
import { StatsFooter } from '~/frameworks/tanstack/ui/components/stats/StatsFooter.tsx';

/* 統計フッターは、画面が消費を受け取る最後の一歩である。

   `usage.presenter.ts` が `state` と `reason` を置いているのは、まさにここで
   「まだ答えが来ていない」「無かった」「観測できなかった」が潰れないためである。
   **3 つを 1 つの空のバケットにすると、読めなかったプロジェクトが静かなプロジェクトと
   同じ絵になる。** */

/* 素材の形は、画面が受け取る形からそのまま取る。**書き写さない** ——
   写すと、向こう側の形が変わってもこのテストだけが通り続ける。 */
type ProjectJson = Parameters<typeof StatsFooter>[0]['project'];
type SessionJson = ProjectJson['sessions'][number];
type UsageJson = Extract<Awaited<ReturnType<typeof getUsage>>, { ok: true }>['body'];

const server = vi.hoisted(() => ({ usage: vi.fn() }));

vi.mock('~/frameworks/tanstack/functions/usage.ts', () => ({
  getUsage: (args: unknown) => server.usage(args),
  findTranscripts: vi.fn(),
}));

const NOW = Date.parse('2026-08-09T12:34:56.000Z');
const SINCE = NOW - 7 * 86_400_000;

const session = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 'session-1',
  file: '/w/one.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: new Date(NOW - 3_600_000).toISOString(),
  last_activity: new Date(NOW - 600_000).toISOString(),
  tokens: 1200,
  tokens_state: 'observed',
  model: 'claude-opus-4-20250514',
  effort: null,
  git_branch: null,
  cwd: null,
  issues: [],
  current: null,
  intervals: [[new Date(NOW - 3_600_000).toISOString(), new Date(NOW - 600_000).toISOString()]],
  intervals_complete: true,
  intervals_state: 'observed',
  size: 4096,
  sources: { state: 'observed', reason: null },
  subagents: [],
  ...over,
});

const project = (over: Partial<ProjectJson> = {}): ProjectJson => ({
  id: 'one',
  slug: 'one',
  path: '/w/one',
  name: 'one',
  live_process: false,
  live_process_count: 0,
  tokens_24h: 1200,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [session()],
  ...over,
});

const usageBody = (over: Partial<UsageJson> = {}): UsageJson => ({
  state: 'observed',
  reason: null,
  since: SINCE,
  buckets: [],
  ...over,
});

function mount(over: Partial<ProjectJson> = {}) {
  /* 取り直しはしない。落ちたことをそのまま見たいので、隠れた再試行を挟ませない */
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatsFooter project={project(over)} nowMs={NOW} />
    </QueryClientProvider>,
  );
}

const noteIn = (container: HTMLElement, panel: string): Element | null =>
  container.querySelector(`${panel} .sf-note`);

describe('消費をまだ受け取っていない間', () => {
  it('平らな 0 のグラフを描かない', async () => {
    // 答えを返さない。読んでいる最中そのものを見る
    server.usage.mockReturnValue(new Promise(() => undefined));

    const { container } = mount();

    await waitFor(() => expect(noteIn(container, '.sf-chart')).not.toBeNull());
    expect(
      container.querySelector('.sf-chart svg'),
      '空のグラフは「静かだった」に見える',
    ).toBeNull();
    expect(noteIn(container, '.sf-chart')?.textContent).toBe('reading…');
    expect(container.querySelector('.sf-chart .sf-big')?.textContent).toBe('—');
  });

  it('`no usage in range` と言い切らない', async () => {
    server.usage.mockReturnValue(new Promise(() => undefined));

    const { container } = mount();

    await waitFor(() => expect(noteIn(container, '.sf-models')).not.toBeNull());
    expect(container.textContent).not.toContain('no usage in range');
  });
});

describe('消費を観測できなかったとき', () => {
  it('読めなかったことを、静かだったことと同じ絵にしない', async () => {
    server.usage.mockResolvedValue({
      ok: true,
      body: usageBody({ state: 'unobservable', reason: 'transcript.unreadable' }),
    });

    const { container } = mount();

    await waitFor(() =>
      expect(container.querySelector('.sf-chart .sf-big')?.textContent).toBe('?'),
    );
    expect(container.querySelector('.sf-chart svg')).toBeNull();
    expect(container.textContent).not.toContain('no usage in range');
    expect(container.querySelector('.sf-win .sf-wtable'), '0 の並ぶ表を出さない').toBeNull();
  });

  it('エラーコードを捨てない。指せば、その語で調べられる', async () => {
    server.usage.mockResolvedValue({
      ok: true,
      body: usageBody({ state: 'unobservable', reason: 'transcript.unreadable' }),
    });

    const { container } = mount();

    await waitFor(() =>
      expect(noteIn(container, '.sf-models')?.getAttribute('title')).toBe(
        'Could not be read — transcript.unreadable',
      ),
    );
  });

  it('断られたときも、断りのエラーコードをそのまま運ぶ', async () => {
    server.usage.mockResolvedValue({
      ok: false,
      status: 404,
      body: { state: 'invalid', code: 'project.not_observed', message: 'Not an observed project' },
    });

    const { container } = mount();

    await waitFor(() =>
      expect(noteIn(container, '.sf-chart')?.getAttribute('title')).toBe(
        'Could not be read — project.not_observed',
      ),
    );
  });

  it('往復そのものが落ちたときも、観測できなかったと言う', async () => {
    server.usage.mockRejectedValue(new Error('fetch failed'));

    const { container } = mount();

    await waitFor(() =>
      expect(
        noteIn(container, '.sf-chart')?.textContent,
        '理由が無いことは、観測できたことではない',
      ).toBe('could not be read'),
    );
  });
});

describe('消費を観測できたとき', () => {
  it('数をそのまま出す', async () => {
    server.usage.mockResolvedValue({
      ok: true,
      body: usageBody({
        buckets: [
          {
            t: NOW - 300_000,
            model: 'claude-opus-4-20250514',
            i: 1000,
            o: 200,
            cr: 5000,
            cw: 300,
            n: 4,
          },
        ],
      }),
    });

    const { container } = mount();

    await waitFor(() => expect(container.querySelector('.sf-chart svg')).not.toBeNull());
    expect(container.querySelector('.sf-chart .sf-big')?.textContent).toBe('1.5k');
    expect(container.querySelector('.sf-models .sf-mname')?.textContent).toBe('opus-4');
    expect(noteIn(container, '.sf-win')).toBeNull();
  });

  it('読んで何も無かったなら、無かったと言う', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody({ state: 'absent' }) });

    const { container } = mount();

    await waitFor(() => expect(container.querySelector('.sf-chart svg')).not.toBeNull());
    expect(
      container.textContent,
      '観測できたうえで無かったのだから、「no usage」と書いてよい',
    ).toContain('no usage in range');
    expect(noteIn(container, '.sf-models')).toBeNull();
  });
});

/* 同時稼働数は消費とは別の素材(稼働区間)から来る。**そちらの観測も潰さない。** */
describe('稼働区間の観測', () => {
  it('まだ読み終えていないプロジェクトに、静かだった階段を描かない', async () => {
    server.usage.mockReturnValue(new Promise(() => undefined));

    const { container } = mount({ read: false, sessions: [] });

    await waitFor(() => expect(noteIn(container, '.sf-conc')).not.toBeNull());
    expect(container.querySelector('.sf-conc svg')).toBeNull();
    expect(container.querySelector('.sf-conc .sf-big')?.textContent).toBe('peak —');
  });

  /* 読めなかった 1 体を理由に階段を消すと、読めている 19 本ぶんの事実まで消える。
     読めた分は階段に、読めなかった分は別の面に落とす。 */
  it('読めなかった稼働区間が在っても、読めた分の階段は描く', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody() });

    const { container } = mount({
      sessions: [
        session(),
        session({ id: 'session-2', file: '/w/two.jsonl' }),
        session({
          id: 'session-3',
          file: '/w/three.jsonl',
          intervals: [],
          intervals_state: 'unobservable',
        }),
      ],
    });

    await waitFor(() =>
      expect(
        container.querySelector('.sf-conc .sf-big')?.textContent,
        '読めた分の階段まで消えている',
      ).toBe('peak 2'),
    );
    expect(container.querySelector('.sf-conc svg')).not.toBeNull();
  });

  it('読めなかったエージェントの数を、山の高さとは別に添える', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody() });

    const { container } = mount({
      sessions: [
        session(),
        session({ id: 'session-2', file: '/w/two.jsonl' }),
        session({
          id: 'session-3',
          file: '/w/three.jsonl',
          intervals: [],
          intervals_state: 'unobservable',
        }),
      ],
    });

    await waitFor(() =>
      expect(
        container.querySelector('.sf-conc .sf-unk')?.textContent,
        '読めなかったことが、静かだったことになっている',
      ).toBe('+1 unknown'),
    );
    expect(container.querySelector('.sf-conc .sf-uarea')).not.toBeNull();
  });

  /* `read` は中身を読み終えたかを言うだけである。読む相手を数え上げられたかは `sources` に
     しか残らないので、走査できなかったプロジェクトは読み終えた後も `sessions` が空のままになる。 */
  it('セッションを走査できなかったプロジェクトに、静かだった階段を描かない', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody() });

    const { container } = mount({
      sessions: [],
      sources: { state: 'unobservable', reason: 'projects.unreadable' },
    });

    await waitFor(() =>
      expect(
        container.querySelector('.sf-conc .sf-big')?.textContent,
        '数え上げられなかったことが、誰も動いていなかったことになっている',
      ).toBe('peak ?'),
    );
    expect(container.querySelector('.sf-conc svg')).toBeNull();
    expect(noteIn(container, '.sf-conc')?.getAttribute('title')).toBe(
      'Could not be read — projects.unreadable',
    );
  });

  it('走査して 1 つも無かったなら、0 と言ってよい', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody() });

    const { container } = mount({ sessions: [], sources: { state: 'absent', reason: null } });

    await waitFor(() => expect(container.querySelector('.sf-conc svg')).not.toBeNull());
    expect(container.querySelector('.sf-conc .sf-big')?.textContent).toBe('peak 0');
  });

  /* 子を歩けなかったセッションが在ると、数えられた高さは下限でしかない。 */
  it('子を数え上げられなかったセッションが在るなら、山の高さを言い切らない', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody() });

    const { container } = mount({
      sessions: [session({ sources: { state: 'unobservable', reason: 'subagents.unreadable' } })],
    });

    await waitFor(() =>
      expect(
        container.querySelector('.sf-conc .sf-big')?.textContent,
        '数え損ねた子が居なかったことになっている',
      ).toBe('peak 1+'),
    );
  });

  it('全部を読めたなら、階段を描く', async () => {
    server.usage.mockResolvedValue({ ok: true, body: usageBody() });

    const { container } = mount();

    await waitFor(() => expect(container.querySelector('.sf-conc svg')).not.toBeNull());
    expect(noteIn(container, '.sf-conc')).toBeNull();
  });
});
