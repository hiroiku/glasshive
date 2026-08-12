import { describe, expect, it } from 'vitest';
import {
  reduceIssueDiscussion,
  reduceIssueEvents,
  reduceIssues,
} from '~/frameworks/tanstack/queries/issues.query.ts';

/* 一覧はページごとに届く。**畳み方を間違えると、届いたぶんが消えるか、二重に並ぶ。**

   ページは前のページを含まないので、行も件数も積み上げる。最初の 1 枚だけは丸ごと置き換わる
   —— そこに `state` と尋ね先が入っていて、それはページより先に決まっている。 */

type IssuesJson = Parameters<typeof reduceIssues>[0];
type Chunk = Parameters<typeof reduceIssues>[1];

const EMPTY: IssuesJson = {
  state: 'absent',
  reason: 'no-source',
  issues: [],
  counts: {},
  truncated: false,
  walked: false,
  repository: null,
  other_repositories: 0,
};

/** 課題 1 件。ここで見るのは畳み方だけなので、id 以外は問わない */
const issue = (id: string) => ({ id }) as IssuesJson['issues'][number];

const head = (over: Partial<IssuesJson> = {}): Chunk => ({
  kind: 'head',
  head: { ...EMPTY, state: 'observed', reason: null, repository: 'hiroiku/glasshive', ...over },
});

const page = (ids: readonly string[], counts: Record<string, number>): Chunk => ({
  kind: 'page',
  issues: ids.map(issue),
  counts,
});

describe('ページを 1 枚の一覧へ畳む', () => {
  it('最初の 1 枚が、尋ね先と `state` を決める', () => {
    const observed = reduceIssues(EMPTY, head());
    const refused = reduceIssues(
      EMPTY,
      head({ state: 'unobservable', reason: 'tracker.timeout', repository: null }),
    );

    expect(observed.state, 'まだ尋ねてもいない `absent` が、答えとして残る').toBe('observed');
    expect(observed.repository).toBe('hiroiku/glasshive');
    expect(refused.state, '観測が成り立たなければ、その 1 枚が答えの全部である').toBe(
      'unobservable',
    );
  });

  it('ページの行は、前のページの後ろに足す', () => {
    let folded = reduceIssues(EMPTY, head());
    folded = reduceIssues(folded, page(['#1', '#2'], {}));
    folded = reduceIssues(folded, page(['#3'], {}));

    expect(
      folded.issues.map((entry) => entry.id),
      'ページで置き換えると、届いたぶんが次のページで消える',
    ).toEqual(['#1', '#2', '#3']);
  });

  it('件数は、ページごとの数を足し合わせる', () => {
    let folded = reduceIssues(EMPTY, head());
    folded = reduceIssues(folded, page([], { open: 100, closed: 3 }));
    folded = reduceIssues(folded, page([], { open: 40 }));

    expect(folded.counts, 'ページで置き換えると、最後のページの件数だけが残る').toEqual({
      open: 140,
      closed: 3,
    });
  });

  /* 上限に当たったかが分かるのは読み終えたときである。読んでいる途中に `true` を置くと、
     切れた先が在るとまだ言えないうちから言うことになる。 */
  it('切れた先が在ることは、読み終えたときに言う', () => {
    let folded = reduceIssues(EMPTY, head());
    folded = reduceIssues(folded, page(['#1'], {}));

    expect(folded.truncated, '読んでいる途中の一覧を、切り詰めたものとして出す').toBe(false);

    folded = reduceIssues(folded, { kind: 'complete', truncated: true });

    expect(folded.truncated).toBe(true);
    expect(folded.issues, '読み終えたことを言うだけで、行は動かさない').toHaveLength(1);
  });

  /* 歩き終えたかを言うのも最後の 1 つだけである。**`truncated` とは別のものである** ——
     あちらは「上限に当たって、その先を読んでいない」で、こちらは「まだ届いている途中」である。
     ここが言わないと、届いたぶんの件数がそのまま全部の件数として画面に出る。 */
  it('歩き終えたことは、最後の 1 つが言う', () => {
    let folded = reduceIssues(EMPTY, head());
    folded = reduceIssues(folded, page(['#1'], { open: 1 }));

    expect(folded.walked, '届いたぶんの件数が、全部の件数として出る').toBe(false);

    folded = reduceIssues(folded, { kind: 'complete', truncated: false });

    expect(folded.walked).toBe(true);
  });

  /* 状態の名前は GitHub から来る。**素のオブジェクトに足さない** —— `__proto__` という名前の
     状態が来ると、その件数はプロトタイプへの代入として黙って捨てられる。台帳の側と同じく、
     prototype の無い入れ物に足す。 */
  it('状態の名前が何であれ、件数を落とさない', () => {
    const counts = JSON.parse('{"__proto__": 2}') as Record<string, number>;
    let folded = reduceIssues(EMPTY, head());
    folded = reduceIssues(folded, { kind: 'page', issues: [], counts });

    expect(
      Object.getOwnPropertyDescriptor(folded.counts, '__proto__')?.value,
      '数えた 2 件が、どこにも残らずに消えている',
    ).toBe(2);
  });
});

/* 記録も同じ形で届く。**`complete` を動かすのは最後の 1 つだけである。**

   読んでいる途中で `true` にすると、まだ届いていない行が「読みに行って、そこに記録が
   無かった行」になる —— 画面ではその行にハッチが掛かる。 */
type EventLogJson = Parameters<typeof reduceIssueEvents>[0];
type EventChunk = Parameters<typeof reduceIssueEvents>[1];

const NO_EVENTS: EventLogJson = {
  state: 'absent',
  reason: 'no-source',
  issues: [],
  complete: false,
  walked: false,
};

const logHead: EventChunk = {
  kind: 'head',
  head: { state: 'observed', reason: null, issues: [], complete: false, walked: false },
};

const eventsOf = (ids: readonly string[]): EventChunk => ({
  kind: 'page',
  issues: ids.map((id) => ({ id, events: [], truncated: false })),
});

describe('記録のページを 1 枚へ畳む', () => {
  it('ページの行は、前のページの後ろに足す', () => {
    let folded = reduceIssueEvents(NO_EVENTS, logHead);
    folded = reduceIssueEvents(folded, eventsOf(['#1']));
    folded = reduceIssueEvents(folded, eventsOf(['#2']));

    expect(
      folded.issues.map((entry) => entry.id),
      'ページで置き換えると、届いた行が次のページで消える',
    ).toEqual(['#1', '#2']);
  });

  it('全部を辿れたかは、読み終えたときに言う', () => {
    let folded = reduceIssueEvents(NO_EVENTS, logHead);
    folded = reduceIssueEvents(folded, eventsOf(['#1']));

    expect(folded.complete, '読んでいる途中の行に、読めなかった行のハッチが掛かる').toBe(false);

    folded = reduceIssueEvents(folded, { kind: 'complete', complete: true });

    expect(folded.complete).toBe(true);
    expect(folded.issues, '読み終えたことを言うだけで、行は動かさない').toHaveLength(1);
  });

  /* 歩き終えたかも最後の 1 つが言う。**`complete` とは別に持つ** —— あちらは「読みに行って、
     そこまでしか辿れなかった」で、こちらは「まだ届いている途中」である。ここが言わないと、
     まだ届いていない行にハッチが掛かり、読めなかった行として画面に出る。 */
  it('歩き終えたことは、最後の 1 つが言う', () => {
    let folded = reduceIssueEvents(NO_EVENTS, logHead);
    folded = reduceIssueEvents(folded, eventsOf(['#1']));

    expect(folded.walked, 'まだ届いていない行に、読めなかった行のハッチが掛かる').toBe(false);

    folded = reduceIssueEvents(folded, { kind: 'complete', complete: true });

    expect(folded.walked).toBe(true);
  });
});

/* やり取りも同じ形で届く。**畳み方を間違えると、届いた発言が次のページで消える。**

   `truncated` と `walked` を動かすのは最後の 1 つだけである。読んでいる途中に立てると、
   まだ届いていない発言が「上限で切った先」として画面に出る。 */
type DiscussionJson = Parameters<typeof reduceIssueDiscussion>[0];
type DiscussionChunk = Parameters<typeof reduceIssueDiscussion>[1];

const NO_DISCUSSION: DiscussionJson = {
  state: 'absent',
  reason: 'no-source',
  entries: [],
  truncated: false,
  walked: false,
};

const discussionHead: DiscussionChunk = {
  kind: 'head',
  head: { ...NO_DISCUSSION, state: 'observed', reason: null },
};

/** 発言 1 つ。ここで見るのは畳み方だけなので、時刻以外は問わない */
const said = (at: string): DiscussionChunk => ({
  kind: 'page',
  entries: [{ at }] as DiscussionJson['entries'],
});

describe('やり取りのページを 1 本へ畳む', () => {
  it('ページの発言は、前のページの後ろに足す', () => {
    let folded = reduceIssueDiscussion(NO_DISCUSSION, discussionHead);
    folded = reduceIssueDiscussion(folded, said('2026-08-01T00:00:00Z'));
    folded = reduceIssueDiscussion(folded, said('2026-08-02T00:00:00Z'));

    expect(
      folded.entries.map((entry) => entry.at),
      'ページで置き換えると、届いた発言が次のページで消える',
    ).toEqual(['2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z']);
  });

  it('切れた先が在ることも、歩き終えたことも、最後の 1 つが言う', () => {
    let folded = reduceIssueDiscussion(NO_DISCUSSION, discussionHead);
    folded = reduceIssueDiscussion(folded, said('2026-08-01T00:00:00Z'));

    expect(folded.truncated, '読んでいる途中の並びが、切り詰めたものとして出る').toBe(false);
    expect(folded.walked, '届く前の画面が、まだ誰も書いていない課題として読める').toBe(false);

    folded = reduceIssueDiscussion(folded, { kind: 'complete', truncated: true });

    expect(folded.truncated).toBe(true);
    expect(folded.walked).toBe(true);
    expect(folded.entries, '読み終えたことを言うだけで、発言は動かさない').toHaveLength(1);
  });
});
