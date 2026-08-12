import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* 課題 1 件のパネルの、本文のところ。

   本文は一覧には乗っていないので、パネルを開いてから 1 件だけ尋ねる。**そのあいだ黙ると、
   本文の無い課題として画面に出る。** 尋ねている最中と、尋ねて読めなかったのと、読んで
   本文が空だったのは、どれも別の絵でなければならない。

   本文とやり取りは別々に尋ねる。どちらが届いてどちらが届いていないかを、画面はそのまま
   出せなければならない —— 差し替えるのは `gh` を起こす関数だけにして、鍵の組み立ても
   `enabled` の判断も本物を通す。 */

const { getGithubIssueBody, getGithubIssueDiscussion } = vi.hoisted(() => ({
  getGithubIssueBody: vi.fn(),
  getGithubIssueDiscussion: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/functions/issues.ts', () => ({
  getGithubIssueBody,
  getGithubIssueDiscussion,
  getGithubIssueEvents: vi.fn(),
  getGithubIssues: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({
    openIssue: vi.fn(),
    openRef: vi.fn(),
    gotoIssues: vi.fn(),
    gotoMilestone: vi.fn(),
  }),
}));

/* 本文が markdown として描かれるかは `MdView` のテストが見ている。ここで確かめたいのは、
   描くものが在るかどうかである。 */
vi.mock('~/frameworks/tanstack/ui/components/text/MdView.tsx', () => ({
  MdView: ({ text }: { text: string }) => <div className="md">{text}</div>,
}));

vi.mock('~/frameworks/tanstack/ui/components/text/SubjectText.tsx', () => ({
  SubjectText: ({ text }: { text: string }) => <span>{text}</span>,
}));

const { GithubIssueDetail } = await import(
  '~/frameworks/tanstack/ui/components/panels/GithubIssueDetail.tsx'
);

type Issue = Parameters<typeof GithubIssueDetail>[0]['issue'];
type Project = Parameters<typeof GithubIssueDetail>[0]['project'];

const SLUG = 'hive';

const issue = (id = '#12'): Issue => ({
  id,
  title: 'title',
  status: 'open',
  issue_type: null,
  labels: [],
  assignee: null,
  created_at: '2026-08-09T12:00:00Z',
  updated_at: '2026-08-09T12:00:00Z',
  closed_at: null,
  deps: [],
  deps_complete: true,
  github: {
    url: 'https://github.com/o/r/issues/12',
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

/* このパネルがプロジェクトから引くのは、尋ね先の `id` と、いま触っているエージェントである。
 **`id` が空なら尋ねない** —— どこの repository の何番かが分からない課題の本文はどこにも無い。 */
const project = {
  id: SLUG,
  slug: SLUG,
  path: '/x',
  name: SLUG,
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [],
} as unknown as Project;

/** 尋ねて、読めなかった答え。**その番号が無かったのではない** */
const unreadable = { ok: true, body: { state: 'unobservable', reason: 'tracker.timeout' } };

/** 読み終えて、何も言われていなかったやり取り */
const quiet = {
  ok: true,
  body: { state: 'observed', reason: null, entries: [], truncated: false },
};

/** 返さないまま置いておく答え。尋ねている最中の画面は、これで留める */
const never = () => new Promise(() => {});

const draw = (over: { issue?: Issue; project?: Project; walked?: boolean } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GithubIssueDetail
        issue={over.issue ?? issue()}
        all={[issue()]}
        walked={over.walked ?? true}
        project={'project' in over ? over.project : project}
        nowMs={Date.parse('2026-08-11T12:00:00Z')}
      />
    </QueryClientProvider>,
  );
};

const labelsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="progressbar"]')].map((node) =>
    node.getAttribute('aria-label'),
  );

beforeEach(() => {
  getGithubIssueBody.mockReset();
  getGithubIssueBody.mockImplementation(never);
  getGithubIssueDiscussion.mockReset();
  getGithubIssueDiscussion.mockImplementation(never);
});

describe('課題の本文', () => {
  it('尋ねている最中は、読んでいることを言う', () => {
    const { container } = draw();

    expect(labelsOf(container), '本文とやり取りは別の求めなので、待ちも別に言う').toEqual([
      'Reading the description',
      'Reading the discussion',
    ]);
  });

  /* **読めなかったことと、まだ届いていないことを同じ絵にしない。** 前者は尋ねた上で
     答えが返らなかったことで、後者はまだ尋ねている最中である。 */
  it('尋ねている最中に、読めなかったとは言わない', () => {
    const { container } = draw();

    expect(container.textContent).not.toContain('The description did not come back');
  });

  it('読めなかったなら、そう言う', async () => {
    getGithubIssueBody.mockResolvedValue(unreadable);
    getGithubIssueDiscussion.mockResolvedValue(quiet);

    const { container } = draw();

    await waitFor(() =>
      expect(container.textContent).toContain('The description did not come back'),
    );
    expect(labelsOf(container), '読み終えた画面に待ちを残さない').toEqual([]);
  });

  it('読めたなら、本文を出す', async () => {
    getGithubIssueBody.mockResolvedValue({
      ok: true,
      body: { state: 'observed', reason: null, body: 'hello' },
    });
    getGithubIssueDiscussion.mockResolvedValue(quiet);

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('.md')?.textContent).toBe('hello'));
    expect(
      container.querySelector('.rl-line'),
      '届いた場所に、取っておいた場所を残さない',
    ).toBeNull();
  });

  /* 本文とやり取りは別の求めなので、片方だけが届くことが在る。**同じ鍵で尋ねていると、
     どちらか一方の答えが両方の顔になる。** */
  it('本文が届いても、やり取りはまだ読んでいると言う', async () => {
    getGithubIssueBody.mockResolvedValue({
      ok: true,
      body: { state: 'observed', reason: null, body: 'hello' },
    });

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('.md')?.textContent).toBe('hello'));
    expect(labelsOf(container)).toEqual(['Reading the discussion']);
  });
});

/* 尋ね先が組み立てられないなら、尋ねに行かない。**「読めなかった」は、尋ねた後にしか言えない** ——
   `gh` を起こしてもいないのに読めなかったと言うと、`unobservable` が観測の外まで広がる。 */
describe('尋ね先が分からない課題', () => {
  it('番号を取り出せない `id` では、`gh` を起こさない', () => {
    draw({ issue: issue('bd-7') });

    expect(getGithubIssueBody, '番号の分からない課題の本文は、どこにも無い').not.toHaveBeenCalled();
    expect(getGithubIssueDiscussion).not.toHaveBeenCalled();
  });

  it('プロジェクトを観測していなければ、`gh` を起こさない', () => {
    draw({ project: undefined });

    expect(
      getGithubIssueBody,
      'どこの repository かが分からないまま番号だけで尋ねられない',
    ).not.toHaveBeenCalled();
  });

  it('尋ねていないあいだ、読んでいるとも言わない', () => {
    const { container } = draw({ issue: issue('bd-7') });

    expect(labelsOf(container), '尋ねていない求めの待ちは、いつまでも終わらない').toEqual([]);
  });
});

/* 下流(この課題を待っている側)は、取ってきた一覧からしか引けない。一覧はページごとに届くので、
   歩き終える前は、まだ届いていないページに居る課題が下流に出ない。**そこを黙らない** ——
   黙ると、誰も待っていない課題として読める。 */
describe('下流が揃っていないこと', () => {
  const NOTE = 'anything waiting on this one may not be listed yet';

  it('歩き終える前は、下流が足りないことを言う', () => {
    const { container } = draw({ walked: false });

    expect(container.textContent, '足りない下流が、下流の全部として読まれる').toContain(NOTE);
  });

  it('歩き終えたら、もう言わない', () => {
    const { container } = draw();

    expect(container.textContent, '読み終えた一覧の下に、足りないという断りが残る').not.toContain(
      NOTE,
    );
  });
});
