import { describe, expect, it } from 'vitest';
import { reduceIssues } from '~/frameworks/tanstack/queries/issues.query.ts';

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
  repository: null,
  other_repositories: 0,
};

/** 課題 1 件。ここで見るのは畳み方だけなので、id 以外は問わない */
const issue = (id: string) => ({ id }) as IssuesJson['issues'][number];

const head = (over: Partial<IssuesJson> = {}): Chunk => ({
  kind: 'issues',
  issues: { ...EMPTY, state: 'observed', reason: null, repository: 'hiroiku/glasshive', ...over },
});

const page = (ids: readonly string[], counts: Record<string, number>): Chunk => ({
  kind: 'page',
  issues: ids.map(issue),
  counts,
});

describe('ページを 1 枚の一覧へ畳む', () => {
  it('最初の 1 枚が、尋ね先と `state` を決める', () => {
    const folded = reduceIssues(EMPTY, head());

    expect(folded.state, 'まだ尋ねてもいない `absent` が、答えとして残る').toBe('observed');
    expect(folded.repository).toBe('hiroiku/glasshive');
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

  it('観測が成り立たなければ、その 1 枚がそのまま答えになる', () => {
    const folded = reduceIssues(
      EMPTY,
      head({ state: 'unobservable', reason: 'tracker.timeout', repository: null }),
    );

    expect(folded.state).toBe('unobservable');
    expect(folded.issues, '読めなかった一覧に行を残すと、読めた顔で出る').toEqual([]);
  });
});
