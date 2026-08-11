import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  IssueDiscussion,
  type IssueDiscussionProps,
} from '~/frameworks/tanstack/ui/components/panels/IssueDiscussion.tsx';

/* 課題 1 件のやり取りの画面。

   確かめるのは 4 つ —— コメントは本文が読める形で出るか、イベントは誰が起こしたのかを
   言うか、**何も言われていない課題と読めなかった課題が別の画面になるか**、そして
   参照が押せるか。空の一覧を 3 通りの意味で使っているので、そこが潰れると、静かな課題が
   観測できなかった課題として画面に出る。 */

const nav = vi.hoisted(() => ({ openIssue: vi.fn(), gotoIssues: vi.fn() }));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({ useNav: () => nav }));

/* 語のインデックスは空にする。ここで確かめたいのは本文が描かれることで、その中の語が
   チップになるかは `MdView` のテストが見ている。 */
vi.mock('~/frameworks/tanstack/ui/hooks/useTokenIndex.ts', async () => {
  const { tokenDict } = await import('~/frameworks/tanstack/ui/derive/tokens.ts');
  return { useTokenIndex: () => tokenDict(new Map(), new Map(), new Map(), new Map()) };
});

/* 形は画面のものをそのまま借りる。写して持つと、外へ出す形が変わったときに
   ここだけ古いまま緑になる。 */
type Answer = IssueDiscussionProps['answer'];
type Discussion = Extract<Answer, { ok: true }>['body'];
type Entries = Discussion['entries'];

const NOW = Date.parse('2026-08-11T12:00:00Z');
const AT = '2026-08-11T11:00:00Z';

const answered = (entries: Entries, truncated = false): Answer => ({
  ok: true,
  body: { state: 'observed', reason: null, entries, truncated },
});

const view = (answer: Answer, pending = false) =>
  render(
    <IssueDiscussion
      answer={answer}
      pending={pending}
      project={undefined}
      nowMs={NOW}
      url="https://github.com/north_harbor/atlas-api/issues/107"
    />,
  ).container;

describe('課題のやり取り', () => {
  it('コメントは本文を markdown として描く', () => {
    const container = view(
      answered([{ kind: 'comment', at: AT, actor: 'rin_sato', body: 'Fixed in **the parser**' }]),
    );

    expect(container.querySelector('.cmt .md strong')?.textContent).toBe('the parser');
  });

  it('コメントは書いた人と、いつかを出す', () => {
    const container = view(
      answered([{ kind: 'comment', at: AT, actor: 'rin_sato', body: 'looks right' }]),
    );

    expect(container.querySelector('.cmt-h')?.textContent).toContain('rin_sato');
    expect(container.querySelector('.cmt-h')?.textContent).toContain('1h ago');
  });

  /* 本文の無いコメントと、本文を読めなかったコメントを同じ空白にすると、
     読めなかったことが画面から消える。 */
  it('本文の無いコメントは黙り、読めなかったコメントはそう言う', () => {
    const empty = view(answered([{ kind: 'comment', at: AT, actor: 'rin_sato', body: '' }]));
    expect(empty.querySelector('.cmt')?.textContent).not.toContain('did not come back');

    const unread = view(answered([{ kind: 'comment', at: AT, actor: 'rin_sato', body: null }]));
    expect(unread.querySelector('.cmt')?.textContent).toContain('did not come back');
  });

  it('イベントは起こした人を出す', () => {
    const container = view(
      answered([
        { kind: 'labeled', at: AT, actor: 'mei_kudo', label: { name: 'bug', color: 'd73a4a' } },
      ]),
    );

    const event = container.querySelector('.disc-ev');
    expect(event?.textContent).toContain('mei_kudo');
    expect(event?.textContent).toContain('bug');
  });

  it('`login` を読めなかったイベントに、誰かの名前を当てない', () => {
    const container = view(answered([{ kind: 'reopened', at: AT, actor: null }]));

    expect(container.querySelector('.disc-ev')?.textContent).toContain('unknown');
  });

  it('コメントとイベントは、同じ姿では出さない', () => {
    const container = view(
      answered([
        { kind: 'comment', at: AT, actor: 'rin_sato', body: 'on it' },
        { kind: 'closed', at: AT, actor: 'rin_sato', reason: 'COMPLETED' },
      ]),
    );

    expect(container.querySelectorAll('.cmt')).toHaveLength(1);
    expect(container.querySelectorAll('.disc-ev')).toHaveLength(1);
  });

  it('GitHub が返した順のまま並べる', () => {
    const container = view(
      answered([
        { kind: 'comment', at: AT, actor: 'rin_sato', body: 'first' },
        { kind: 'comment', at: '2026-08-11T11:30:00Z', actor: 'mei_kudo', body: 'second' },
      ]),
    );

    const texts = [...container.querySelectorAll('.cmt .md')].map((node) =>
      node.textContent?.trim(),
    );
    expect(texts).toEqual(['first', 'second']);
  });

  it('課題を名指すイベントは、押せるチップになる', () => {
    const container = view(
      answered([
        {
          kind: 'cross-referenced',
          at: AT,
          actor: 'rin_sato',
          source: { number: 26, title: 'Rewrite the parser' },
          will_close_target: true,
        },
      ]),
    );

    const chip = container.querySelector<HTMLElement>('.disc-ev .ichip');
    expect(chip?.textContent).toContain('#26');

    fireEvent.click(chip as HTMLElement);
    expect(nav.openIssue).toHaveBeenCalledWith('#26');
  });

  it('堰き止めた相手も、重複の相手も、親も同じように押せる', () => {
    const container = view(
      answered([
        {
          kind: 'blocked-by-added',
          at: AT,
          actor: 'rin_sato',
          blocking_issue: { number: 12, title: null },
        },
        {
          kind: 'marked-as-duplicate',
          at: AT,
          actor: 'rin_sato',
          canonical: { number: 34, title: null },
        },
        { kind: 'parent-added', at: AT, actor: 'rin_sato', parent: { number: 56, title: null } },
      ]),
    );

    const chips = [...container.querySelectorAll('.disc-ev .ichip')].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(['#12', '#34', '#56']);
  });

  /* ここが潰れると、静かな課題が観測できなかった課題として画面に出る。 */
  it('何も言われていない課題は、静かに何も無いと言う', () => {
    const container = view(answered([]));

    expect(container.querySelector('.disc-quiet')).not.toBeNull();
    expect(container.querySelector('.not-observed'), '読めなかった板は出さない').toBeNull();
  });

  it('観測できなかったやり取りは `NotObserved` を出す', () => {
    const container = view({
      ok: true,
      body: {
        state: 'unobservable',
        reason: 'tracker.timeout',
        entries: [],
        truncated: false,
      },
    });

    expect(container.querySelector('.not-observed')).not.toBeNull();
    expect(container.querySelector('.disc-quiet'), '静かな課題の画面は出さない').toBeNull();
    expect(container.querySelector('.no-code')?.textContent).toBe('tracker.timeout');
  });

  it('呼び出しが届かなかったときも `NotObserved` を出す', () => {
    const container = view({
      ok: false,
      status: 503,
      body: { state: 'unobservable', code: 'tracker.denied', message: 'gh refused' },
    });

    expect(container.querySelector('.no-code')?.textContent).toBe('tracker.denied');
  });

  /* 「その番号が無かった」と「読みに行けなかった」を同じ文言にすると、
     `gh` が答えたのかどうかが画面から消える。 */
  it('その番号が無かったことと、読めなかったことを別の文言で言う', () => {
    const absent = view({
      ok: true,
      body: { state: 'absent', reason: 'empty', entries: [], truncated: false },
    });
    const unobservable = view({
      ok: true,
      body: { state: 'unobservable', reason: 'tracker.timeout', entries: [], truncated: false },
    });

    const title = (container: HTMLElement) => container.querySelector('.no-title')?.textContent;
    expect(title(absent)).not.toBe(title(unobservable));
  });

  /* 尋ねている最中に空の一覧を出すと、これから届くやり取りが「無かった」ことになる。 */
  it('尋ねている最中は何も出さない', () => {
    const container = view(undefined, true);

    expect(container.textContent).toBe('');
  });

  it('読み切っていないことを黙らない', () => {
    const container = view(
      answered([{ kind: 'comment', at: AT, actor: 'rin_sato', body: 'first' }], true),
    );

    expect(container.querySelector('.disc-cut')).not.toBeNull();
  });
});
