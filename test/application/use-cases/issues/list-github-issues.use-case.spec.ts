import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { TrackerResponseUnreadableError } from '~/application/errors/issues/tracker-response.error.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import {
  createListGithubIssues,
  type IssueListingChunk,
  type IssueListingHead,
  type IssueSummary,
} from '~/application/use-cases/issues/list-github-issues.use-case.ts';

class TrackerUnreachable extends AppError {
  readonly code = 'tracker.exit_nonzero';
}

/** remote の設定だけを答える `git`。他のことは尋ねられない */
const gitWithConfig = (stdout: string): GitCommandIntegration => ({
  async run() {
    return observed(stdout);
  },
});

/** `origin` 1 つだけを持つリポジトリ */
const gitWithRemote = (url: string): GitCommandIntegration =>
  gitWithConfig(`remote.origin.url ${url}`);

/** remote を持たないリポジトリ。`git config --get-regexp` は非ゼロで終わる */
const gitWithoutRemote = (): GitCommandIntegration => ({
  async run() {
    return unobservable(new TrackerUnreachable('no remote'));
  },
});

const pageOf = (numbers: readonly number[], next: string | null, total?: number, state = 'OPEN') =>
  JSON.stringify({
    data: {
      repository: {
        issues: {
          ...(total === undefined ? {} : { totalCount: total }),
          pageInfo: { hasNextPage: next !== null, endCursor: next },
          nodes: numbers.map((number) => ({
            number,
            title: `issue ${number}`,
            state,
            blockedBy: { nodes: [] },
          })),
        },
      },
    },
  });

/** ページごとに答えを決めておくトラッカー。何をどう尋ねられたかも残す */
function fakeTracker(pages: readonly string[]) {
  const asked: { owner: string; name: string; cursor: string | null }[] = [];
  const tracker: IssueTrackerIntegration = {
    async fetchIssuePage(request) {
      asked.push({ owner: request.owner, name: request.name, cursor: request.cursor });
      const text = pages[asked.length - 1];
      return text === undefined ? absent('empty') : observed(text);
    },
    /* 一覧の呼び出しは本文もやり取りも尋ねない。**尋ねたら落ちるようにしておく** ——
       尋ね始めたら、それは一覧に 1 件ぶんの読み込みを混ぜ戻したということである */
    async fetchIssueBody() {
      throw new Error('一覧は本文を尋ねない');
    },
    async fetchIssueDiscussion() {
      throw new Error('一覧はやり取りを尋ねない');
    },
    async fetchIssueEvents() {
      throw new Error('ここはイベントを尋ねない');
    },
  };
  return { tracker, asked };
}

/* 顔は課題の一覧そのものには関わらない。どのプロジェクトの一覧を覚えさせたかだけ控える偽物を置く */
function fakeAvatars() {
  const remembered: { projectPath: string; issues: number }[] = [];
  const avatars: AvatarCacheService = {
    remember: (projectPath, ledger) =>
      remembered.push({ projectPath, issues: ledger.issues.length }),
    rememberActors: () => undefined,
    warm: () => undefined,
    read: async () => absent('no-source'),
  };
  return { avatars, remembered };
}

/* 配られたチャンクを、そのまま 1 つに集める。**`Observation` に組み直さない** ——
   組み直すと、その組み直し方をここで確かめることになる。 */
async function collect(useCase: ReturnType<typeof createListGithubIssues>, projectPath: string) {
  const walk = useCase.stream({ projectPath, includeClosed: false });
  let head: Observation<IssueListingHead> | null = null;
  const issues: IssueSummary[] = [];
  let truncated = false;

  for await (const chunk of walk) {
    if (chunk.kind === 'head') head = chunk.head;
    else if (chunk.kind === 'complete') truncated = chunk.truncated;
    else issues.push(...chunk.ledger.issues);
  }
  return { kind: head?.kind ?? 'missing', head, issues, truncated };
}

describe('GitHub の課題を一覧にする', () => {
  /* どこまで歩いたかは、受け取った課題の数でしか言えない。**一覧に載る数では言えない** ——
     閉じた課題は落ちるので、そちらで数えると歩いた分が消える。 */
  it('歩く先の全部の件数と、ページごとに受け取った数を配る', async () => {
    /* 閉じた課題を混ぜる。**一覧には載らないが、歩いてはいる** —— ここが同じ数だと、
       一覧の行数で数える書き方も通ってしまう。 */
    const { tracker } = fakeTracker([pageOf([1, 2], 'cur', 5, 'CLOSED'), pageOf([3], null, 5)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git\n'),
      tracker,
    });

    const fetched: number[] = [];
    const listed: number[] = [];
    let total: number | null | undefined;
    for await (const chunk of useCase.stream({
      projectPath: '/work/glasshive',
      includeClosed: false,
    })) {
      if (chunk.kind === 'head' && chunk.head.kind === 'observed') total = chunk.head.value.total;
      if (chunk.kind === 'page') {
        fetched.push(chunk.fetched);
        listed.push(chunk.ledger.issues.length);
      }
    }

    expect(total, '総数はページ 1 を読んで初めて分かる。最初の 1 枚がそれを運ぶ').toBe(5);
    expect(fetched, 'ページごとの数を配らないと、受け取る側は積み上げられない').toEqual([2, 1]);
    expect(listed, '一覧に載る数で数えると、閉じた課題を歩いた分が消える').toEqual([0, 1]);
  });

  /* 総数を答えてもらえないことが在る。**上限のページ数で作らない** —— 「5 ページ中 2 ページ」は
     上限までの割合であって、課題が幾つ在るかは言っていない。 */
  it('総数を答えられていなければ、そのまま答えられていないと言う', async () => {
    const { tracker } = fakeTracker([pageOf([1], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git\n'),
      tracker,
    });

    const { head } = await collect(useCase, '/work/glasshive');

    expect(
      head?.kind === 'observed' ? head.value.total : 'missing',
      '観測していない分母を作ると、その分母で割った割合が画面に出る',
    ).toBe(null);
  });

  it('remote から owner とリポジトリ名を引いて尋ねる', async () => {
    const { tracker, asked } = fakeTracker([pageOf([1], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git\n'),
      tracker,
    });

    await collect(useCase, '/work/glasshive');

    expect(asked[0], '尋ねる先を決めるのは remote であって、呼んできた側ではない').toEqual({
      owner: 'hiroiku',
      name: 'glasshive',
      cursor: null,
    });
  });

  it('remote の名前が `origin` でなくても尋ねる', async () => {
    const { tracker, asked } = fakeTracker([pageOf([1], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithConfig('remote.github.url git@github.com:kuden-world/kuden-drive.git'),
      tracker,
    });

    await collect(useCase, '/work/kuden-os');

    expect(
      asked[0],
      '`origin` だけを見ると、remote が 1 つしか無いリポジトリでも GitHub が無いことになる',
    ).toMatchObject({ owner: 'kuden-world', name: 'kuden-drive' });
  });

  it('remote が複数あるときは、`gh` と同じ順で選ぶ', async () => {
    const { tracker, asked } = fakeTracker([pageOf([1], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithConfig(
        [
          'remote.origin.url git@github.com:me/my-fork.git',
          'remote.upstream.url git@github.com:them/the-tool.git',
        ].join('\n'),
      ),
      tracker,
    });

    await collect(useCase, '/work/the-tool');

    expect(
      asked[0],
      'fork では課題が元のリポジトリに在るので、`upstream` が先に来る',
    ).toMatchObject({ owner: 'them', name: 'the-tool' });
  });

  it('`gh repo set-default` を打ってあれば、名前の順より先にそれを見る', async () => {
    const { tracker, asked } = fakeTracker([pageOf([1], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithConfig(
        [
          'remote.origin.url git@github.com:me/my-fork.git',
          'remote.origin.gh-resolved base',
          'remote.upstream.url git@github.com:them/the-tool.git',
        ].join('\n'),
      ),
      tracker,
    });

    await collect(useCase, '/work/the-tool');

    expect(
      asked[0],
      'どれが本命かをユーザーが自分で決めてあるなら、こちらが推し量る余地は無い',
    ).toMatchObject({ owner: 'me', name: 'my-fork' });
  });

  it('GitHub を指していないプロジェクトは、観測できたうえで無かったこと', async () => {
    const { tracker, asked } = fakeTracker([]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@gitlab.com:team/tool.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/tool');

    expect(result.kind).toBe('absent');
    expect(asked, 'GitHub でない相手に尋ねに行かない').toHaveLength(0);
  });

  it('remote を持たないリポジトリを、読めなかったことにしない', async () => {
    const { tracker } = fakeTracker([]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithoutRemote(),
      tracker,
    });

    const result = await collect(useCase, '/work/local');

    expect(
      result.kind,
      '手元だけのリポジトリで赤い画面を出すと、ほとんどのプロジェクトがそう見える',
    ).toBe('absent');
  });

  it('次のページがある間は辿る', async () => {
    const { tracker, asked } = fakeTracker([pageOf([1, 2], 'cur1'), pageOf([3], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('https://github.com/hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(asked[1]?.cursor, '前のページが答えた続きの位置から尋ねる').toBe('cur1');
    expect(result.issues).toHaveLength(3);
  });

  it('上限に当たったら、そう言う', async () => {
    // どのページも「まだ先がある」と答え続ける
    const endless = Array.from({ length: 6 }, (_, index) => pageOf([index + 1], `cur${index}`));
    const { tracker, asked } = fakeTracker(endless);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('https://github.com/hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(asked.length, '際限なく辿らない').toBe(5);
    expect(result.truncated, '黙って切ると、上限より後ろの課題が「無かった」ことになる').toBe(true);
  });

  it('1 ページ目で尋ねられなければ、観測できなかったと言う', async () => {
    const tracker: IssueTrackerIntegration = {
      async fetchIssuePage() {
        return unobservable(new TrackerUnreachable('gh exited non-zero'));
      },
      /* 一覧の呼び出しは本文もやり取りも尋ねない。**尋ねたら落ちるようにしておく** ——
       尋ね始めたら、それは一覧に 1 件ぶんの読み込みを混ぜ戻したということである */
      async fetchIssueBody() {
        throw new Error('一覧は本文を尋ねない');
      },
      async fetchIssueDiscussion() {
        throw new Error('一覧はやり取りを尋ねない');
      },
      async fetchIssueEvents() {
        throw new Error('ここはイベントを尋ねない');
      },
    };
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(result.kind, '空の一覧にすると、課題が 1 件も無いリポジトリに見える').toBe(
      'unobservable',
    );
  });

  it('1 ページ目の応答を歩けなければ、観測できなかったと言う', async () => {
    // `gh` は 0 で終わったが、返ってきたテキストから課題へ辿れない
    const { tracker } = fakeTracker(['{"errors":[{"message":"Bad credentials"}]}']);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(
      result.kind,
      '歩けなかった応答を空の一覧にすると、課題が 1 件も無いリポジトリに見える',
    ).toBe('unobservable');
    const error = result.head?.kind === 'unobservable' ? result.head.error : null;
    expect(
      error,
      '`gh` に尋ねられなかったのではない。エラーコードを分けておかないと、画面は入り直しを勧められない',
    ).toBeInstanceOf(TrackerResponseUnreadableError);
    expect(error?.code).toBe('tracker.unreadable_response');
  });

  /* `gh` が 0 で終わり、`data.repository.issues` までは在るのに、課題の並びだけが無い。
     ここを空の一覧に倒すと、認証や権限で欄ごと落ちた応答が「課題が 1 件も無い」に化ける。 */
  it('課題の並びの無い 1 ページ目を、課題が 1 件も無いことにしない', async () => {
    const withoutNodes = JSON.stringify({
      data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null } } } },
    });
    const { tracker } = fakeTracker([withoutNodes]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(result.kind, '課題の並びを辿れなかったのだから、1 件も観ていない').toBe('unobservable');
    expect(result.head?.kind === 'unobservable' ? result.head.error : null).toBeInstanceOf(
      TrackerResponseUnreadableError,
    );
  });

  it('課題の並びの無いページに当たったら、その先は読んでいないと言って止まる', async () => {
    const withoutNodes = JSON.stringify({
      data: { repository: { issues: { pageInfo: { hasNextPage: true, endCursor: 'cur2' } } } },
    });
    const { tracker, asked } = fakeTracker([
      pageOf([1, 2], 'cur1'),
      withoutNodes,
      pageOf([3], null),
    ]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(asked, '辿れなかったページの続きを、読めたページとして辿り続けない').toHaveLength(2);
    expect(result.kind).toBe('observed');
    expect(result.issues, '観えた 2 件を捨てると、一覧が空になる').toHaveLength(2);
    expect(
      result.truncated,
      '黙って切ると、辿れなかったページより後ろの課題が「無かった」ことになる',
    ).toBe(true);
  });

  it('途中のページを歩けなくなっても、観えたぶんは捨てず、その先は読んでいないと言う', async () => {
    const { tracker } = fakeTracker([pageOf([1, 2], 'cur1'), 'not json at all']);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(result.kind).toBe('observed');
    expect(result.issues, '観えた 2 件を捨てると、一覧が空になる').toHaveLength(2);
    expect(
      result.truncated,
      '黙って切ると、歩けなかったページより後ろの課題が「無かった」ことになる',
    ).toBe(true);
  });

  it('続きが在ると言われたのに位置を答えないページで止まったら、そう言う', async () => {
    const withoutCursor = JSON.stringify({
      data: {
        repository: {
          issues: {
            pageInfo: { hasNextPage: true, endCursor: null },
            nodes: [{ number: 1, state: 'OPEN', blockedBy: { nodes: [] } }],
          },
        },
      },
    });
    const { tracker, asked } = fakeTracker([withoutCursor]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(asked, '続きの位置が無ければ、次を尋ねようが無い').toHaveLength(1);
    expect(result.truncated, '続きが在ると言われたまま止まったのだから、全部は読んでいない').toBe(
      true,
    );
  });

  it('どのプロジェクトの一覧かを添えて顔を覚えさせる', async () => {
    const { tracker } = fakeTracker([pageOf([1], null)]);
    const { avatars, remembered } = fakeAvatars();
    const useCase = createListGithubIssues({
      avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    await collect(useCase, '/work/glasshive');

    expect(
      remembered,
      '顔のキャッシュは全部のプロジェクトで 1 つなので、どの一覧の顔かを言わないと互いに消し合う',
    ).toEqual([{ projectPath: '/work/glasshive', issues: 1 }]);
  });

  it('途中で尋ねられなくなっても、観えたぶんは捨てない', async () => {
    let calls = 0;
    const tracker: IssueTrackerIntegration = {
      async fetchIssuePage() {
        calls++;
        if (calls === 1) return observed(pageOf([1, 2], 'cur1'));
        return unobservable(new TrackerUnreachable('rate limited'));
      },
      /* 一覧の呼び出しは本文もやり取りも尋ねない。**尋ねたら落ちるようにしておく** ——
       尋ね始めたら、それは一覧に 1 件ぶんの読み込みを混ぜ戻したということである */
      async fetchIssueBody() {
        throw new Error('一覧は本文を尋ねない');
      },
      async fetchIssueDiscussion() {
        throw new Error('一覧はやり取りを尋ねない');
      },
      async fetchIssueEvents() {
        throw new Error('ここはイベントを尋ねない');
      },
    };
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await collect(useCase, '/work/glasshive');

    expect(result.kind).toBe('observed');
    expect(result.issues, '観えた 2 件を捨てると、一覧が空になる').toHaveLength(2);
    expect(result.truncated, 'その先を読んでいないことは言う').toBe(true);
  });
});

/* 一覧をページごとに配る。**ページ 1 の 100 件に、ページ 5 を待つ理由は無い。**

   配る順そのものが約束である。尋ね先が決まる前に課題は来ないし、ページを 1 枚も読めなければ
   課題は 1 件も来ない。積み上げるのは受け取る側なので、ここが配るのはそのページぶんだけである。 */
describe('読めたページから順に配る', () => {
  /** 配られたものを、届いた順に並べる */
  const drain = async (stream: AsyncGenerator<IssueListingChunk, void, void>) => {
    const chunks: IssueListingChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  };

  /** 種類で絞る。絞った先の欄をそのまま読めるように、型もそこで狭める */
  const only = <K extends IssueListingChunk['kind']>(
    chunks: readonly IssueListingChunk[],
    kind: K,
  ): Extract<IssueListingChunk, { kind: K }>[] =>
    chunks.filter((chunk): chunk is Extract<IssueListingChunk, { kind: K }> => chunk.kind === kind);

  const listing = (pages: readonly string[], avatars = fakeAvatars()) =>
    createListGithubIssues({
      avatars: avatars.avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker: fakeTracker(pages).tracker,
    });

  it('ページごとに、そのページぶんだけを配る', async () => {
    const useCase = listing([pageOf([1, 2], 'c1'), pageOf([3], null)]);

    const chunks = await drain(
      useCase.stream({ projectPath: '/work/glasshive', includeClosed: false }),
    );

    expect(
      chunks.map((chunk) => chunk.kind),
      '尋ね先より先に課題が来ると、どこの課題なのか言えないまま行が並ぶ',
    ).toEqual(['head', 'page', 'page', 'complete']);
    expect(
      only(chunks, 'page').map((chunk) => chunk.ledger.issues.length),
      '積み上げたものを配ると、同じ課題が何度も運ばれる',
    ).toEqual([2, 1]);
  });

  it('ページ 1 を読めなければ、課題を 1 件も配らない', async () => {
    const useCase = listing(['not json at all']);

    const chunks = await drain(
      useCase.stream({ projectPath: '/work/glasshive', includeClosed: false }),
    );

    expect(
      chunks.map((chunk) => chunk.kind),
      '1 件も観ていない一覧を、観測できたことにしない',
    ).toEqual(['head', 'complete']);
    expect(only(chunks, 'head')[0]?.head.kind).toBe('unobservable');
  });

  /* `remember` はプロジェクト 1 つぶんを丸ごと置き換える。ページごとにそのページだけを
     覚えさせると、ページ 2 が届いた瞬間にページ 1 の人の顔が引けなくなる。 */
  it('顔は、ここまでに観た全部で覚え直す', async () => {
    const avatars = fakeAvatars();
    const useCase = listing([pageOf([1, 2], 'c1'), pageOf([3], null)], avatars);

    await drain(useCase.stream({ projectPath: '/work/glasshive', includeClosed: false }));

    expect(
      avatars.remembered.map((call) => call.issues),
      'ページごとに入れ替えると、前のページに出ていた人の顔が引けなくなる',
    ).toEqual([2, 3]);
  });

  it('尋ね先が引けなければ、尋ねに行かない', async () => {
    const { tracker, asked } = fakeTracker([]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithoutRemote(),
      tracker,
    });

    const chunks = await drain(
      useCase.stream({ projectPath: '/work/glasshive', includeClosed: false }),
    );

    expect(asked, '尋ね先が無いのに `gh` を起こしている').toEqual([]);
    expect(chunks.map((chunk) => chunk.kind)).toEqual(['head', 'complete']);
    expect(
      only(chunks, 'head')[0]?.head.kind,
      'GitHub の remote が無いのは「課題が無い」であって「読めなかった」ではない',
    ).toBe('absent');
  });
});
