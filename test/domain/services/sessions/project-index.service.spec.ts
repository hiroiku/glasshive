import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  indexProjects,
  type LocatedGroup,
  type LocatedSession,
} from '~/domain/services/sessions/project-index.service.ts';

/* 何が行として並ぶかを決めるところ。

   セッションが空になる理由は 2 つある。本当に 1 つも無いのと、ディレクトリを読めなかった
   のである。**この 2 つを同じに扱うと、読めなかったプロジェクトが一覧から黙って消える。** */

const T0 = Date.parse('2026-08-09T12:00:00Z');

class Denied extends AppError {
  readonly code = 'test.denied';
}

const session = (at: number = T0): LocatedSession => ({
  file: '/nest/projects/-work-myproj/sess.jsonl',
  cwd: '/work/myproj',
  lastActivityMs: at,
});

function group(
  overrides: Partial<LocatedGroup<LocatedSession>> = {},
): LocatedGroup<LocatedSession> {
  return {
    slug: '-work-myproj',
    canonicalPath: '/work/myproj',
    sessions: [session()],
    ...overrides,
  };
}

const idsOf = (groups: readonly LocatedGroup<LocatedSession>[]) =>
  indexProjects({ groups, processes: [] }).map((project) => project.id);

describe('行として数える slug を決める', () => {
  it('セッションを持つ slug は行になる', () => {
    expect(idsOf([group()])).toEqual(['-work-myproj']);
  });

  it('セッションを 1 つも持たない slug は、プロジェクトとして数えない', () => {
    const empty = group({ slug: '-work-empty', canonicalPath: null, sessions: [] });
    expect(idsOf([group(), empty]), '空のディレクトリはプロジェクトではない').toEqual([
      '-work-myproj',
    ]);
  });

  it('走査できたと言われた空の slug も、数えない', () => {
    const empty = group({
      slug: '-work-empty',
      canonicalPath: null,
      sessions: [],
      walked: observed(0),
    });
    expect(idsOf([empty]), '走査できて 0 本なら、本当に 1 つも無い').toEqual([]);
  });

  it('走査の途中で消えた slug も、数えない', () => {
    const gone = group({
      slug: '-work-gone',
      canonicalPath: null,
      sessions: [],
      walked: absent('no-source'),
    });
    expect(idsOf([gone]), '無くなったディレクトリにセッションは無い').toEqual([]);
  });

  it('走査できなかった slug は、セッションが見えなくても行に残す', () => {
    const closed = group({
      slug: '-work-closed',
      canonicalPath: null,
      sessions: [],
      walked: unobservable(new Denied('開けない')),
    });

    const indexed = indexProjects({ groups: [group(), closed], processes: [] });

    expect(
      indexed.map((project) => project.id),
      '落とすと、動いているセッションを抱えたプロジェクトが初めから無かったのと同じに見える',
    ).toEqual(['-work-myproj', '-work-closed']);
    expect(indexed[1]?.name, 'パスが分からないので、名前に使えるのは slug しか残っていない').toBe(
      '-work-closed',
    );
  });

  /* ディレクトリが mode 444 のとき、`readdirSync` は成功して `transcript` を返し、
     1 本ずつを見に行くところで落ちる。走査そのものは通っているので、行を残す条件を
     「走査できなかったか」だけにすると、ここがまた黙って消える。 */
  it('走査は通っても、見えた `transcript` を 1 本も載せられなかった slug は行に残す', () => {
    const short = group({
      slug: '-work-short',
      canonicalPath: null,
      sessions: [],
      walked: observed(1),
    });

    const indexed = indexProjects({ groups: [group(), short], processes: [] });

    expect(
      indexed.map((project) => project.id),
      '見えているのに載せられなかったことを「無かった」に倒すと、プロジェクトが消える',
    ).toEqual(['-work-myproj', '-work-short']);
  });

  it('走査できなかった slug どうしは、別の行のまま', () => {
    const closed = (slug: string) =>
      group({
        slug,
        canonicalPath: null,
        sessions: [],
        walked: unobservable(new Denied('開けない')),
      });

    expect(
      idsOf([closed('-work-a'), closed('-work-b')]),
      'パスが分からないもの同士を同じ実体と見なす根拠は無い',
    ).toEqual(['-work-a', '-work-b']);
  });
});

describe('走査できたかを、行まで運ぶ', () => {
  it('数え上げられた slug の数を、そのまま持つ', () => {
    const indexed = indexProjects({
      groups: [group({ sessions: [session(), session(), session()], walked: observed(3) })],
      processes: [],
    });
    expect(indexed[0]?.walked).toEqual(observed(3));
  });

  it('走査できたと言われていない slug は、見えたセッションのぶんだけ走査できたものとする', () => {
    const indexed = indexProjects({ groups: [group()], processes: [] });
    expect(indexed[0]?.walked, 'セッションが 1 つ見えているのだから、走査はできている').toEqual(
      observed(1),
    );
  });

  it('走査できなかった slug は、行の欄でも走査できなかったことにする', () => {
    const closed = group({
      slug: '-work-closed',
      canonicalPath: null,
      sessions: [],
      walked: unobservable(new Denied('開けない')),
    });

    const indexed = indexProjects({ groups: [closed], processes: [] });

    expect(
      indexed[0]?.walked.kind,
      'ここで潰すと、行に残した意味が消える。セッションが空な理由がどこにも残らない',
    ).toBe('unobservable');
  });

  it('見えた数と載せられた数が食い違う slug は、数え上げられなかったことにする', () => {
    const short = group({ sessions: [session()], walked: observed(3) });

    const indexed = indexProjects({ groups: [short], processes: [] });

    expect(
      indexed[0]?.walked.kind,
      '`observed` のまま通すと、載せられなかった 2 本が「無かった」ものとして数に混ざる',
    ).toBe('unobservable');
  });

  it('束ねた slug の 1 つが走査できなければ、束ねた先も走査できなかったことにする', () => {
    const seen = group({ slug: '-work-a', walked: observed(1) });
    const closed = group({
      slug: '-volumes-work-a',
      sessions: [],
      walked: unobservable(new Denied('開けない')),
    });

    const indexed = indexProjects({ groups: [seen, closed], processes: [] });

    expect(indexed, '同じパスを指すので 1 行に束なる').toHaveLength(1);
    expect(
      indexed[0]?.walked.kind,
      '読めた slug のぶんだけを数えると、数え落とした `transcript` が「無かった」に化ける',
    ).toBe('unobservable');
  });

  it('束ねた slug がどれも数え上げられていれば、見えた数を足す', () => {
    const one = group({ slug: '-work-a', sessions: [session(), session()], walked: observed(2) });
    const two = group({
      slug: '-volumes-work-a',
      sessions: [session(), session(), session(), session(), session()],
      walked: observed(5),
    });

    const indexed = indexProjects({ groups: [one, two], processes: [] });

    expect(indexed[0]?.walked).toEqual(observed(7));
  });
});
