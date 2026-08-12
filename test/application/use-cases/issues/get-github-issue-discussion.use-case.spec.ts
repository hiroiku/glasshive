import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type {
  IssueDiscussionRequest,
  IssueTrackerIntegration,
} from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import { createGetGithubIssueDiscussion } from '~/application/use-cases/issues/get-github-issue-discussion.use-case.ts';

/* 課題 1 件のやり取りは、本文と同じく 1 件を開いたときにだけ引く。

   ここで見るのは 3 つ —— 一覧と同じリポジトリを尋ねているか、誰も何も言っていない課題を
   `absent` に倒していないか、上限に当たったことを言えているか。 */

class TrackerUnreachable extends AppError {
  readonly code = 'tracker.exit_nonzero';
}

const gitWithRemote = (url: string): GitCommandIntegration => ({
  async run() {
    return observed(`remote.origin.url ${url}`);
  },
});

/** remote を持たないリポジトリ。`git config --get-regexp` は非ゼロで終わる */
const gitWithoutRemote = (): GitCommandIntegration => ({
  async run() {
    return unobservable(new TrackerUnreachable('no remote'));
  },
});

const commentAt = (at: string, body: string) => ({
  __typename: 'IssueComment',
  createdAt: at,
  author: { login: 'octocat' },
  body,
});

const pageOf = (nodes: readonly unknown[], next: string | null) =>
  JSON.stringify({
    data: {
      repository: {
        issue: {
          timelineItems: {
            pageInfo: { hasNextPage: next !== null, endCursor: next },
            nodes,
          },
        },
      },
    },
  });

/** ページごとに答えを決めておくトラッカー。何をどう尋ねられたかも残す */
function fakeTracker(pages: readonly string[]) {
  const asked: IssueDiscussionRequest[] = [];
  const tracker: IssueTrackerIntegration = {
    async fetchIssuePage() {
      throw new Error('やり取りの呼び出しは一覧を尋ねない');
    },
    /* やり取りの呼び出しは本文を尋ねない。パネルは既に本文を持っていて、
       同じものを 2 度運ぶと、どちらが新しいかを決める仕事が増える */
    async fetchIssueBody() {
      throw new Error('やり取りの呼び出しは本文を尋ねない');
    },
    async fetchIssueDiscussion(request) {
      asked.push(request);
      const text = pages[asked.length - 1];
      return text === undefined
        ? unobservable(new TrackerUnreachable('尋ねられていないページ'))
        : observed(text);
    },
    async fetchIssueEvents() {
      throw new Error('ここはイベントを尋ねない');
    },
  };
  return { tracker, asked };
}

/* 顔を引ける先を覚えさせた相手。**やり取りで名指された人は一覧に居ないことが在る** ——
   覚えさせていないと、その人の顔だけがどこからも引けない */
function fakeAvatars() {
  const learned: string[] = [];
  const avatars: AvatarCacheService = {
    remember: () => undefined,
    rememberActors: (actors) => {
      for (const actor of actors) learned.push(actor.login);
    },
    warm: () => undefined,
    read: async () => absent('no-source'),
  };
  return { avatars, learned };
}

const useCaseWith = (
  tracker: IssueTrackerIntegration,
  git = gitWithRemote('git@github.com:hiroiku/glasshive.git'),
  avatars: AvatarCacheService = fakeAvatars().avatars,
) => createGetGithubIssueDiscussion({ git, tracker, avatars });

describe('GitHub の課題 1 件のやり取り', () => {
  it('remote が指すリポジトリの、その番号を尋ねる', async () => {
    const { tracker, asked } = fakeTracker([
      pageOf([commentAt('2026-08-01T00:00:00Z', 'ひとこと')], null),
    ]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(asked, '一覧に出ていた課題を、別のリポジトリに尋ね直さない').toEqual([
      { owner: 'hiroiku', name: 'glasshive', number: 13, cursor: null },
    ]);
    expect(
      result.ok && result.value.kind === 'observed' && result.value.value.entries,
    ).toHaveLength(1);
  });

  it('誰も何も言っていない課題を、読めなかったことにしない', async () => {
    const { tracker } = fakeTracker([pageOf([], null)]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 1,
    });

    expect(
      result.ok && result.value.kind,
      '誰も書いていないのは、こちらが観測できた事実である',
    ).toBe('observed');
    if (result.ok && result.value.kind === 'observed') {
      expect(result.value.value.entries).toEqual([]);
      expect(result.value.value.truncated).toBe(false);
    }
  });

  it('その番号が応答に無ければ、無かったと言う', async () => {
    const { tracker } = fakeTracker([JSON.stringify({ data: { repository: { issue: null } } })]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 99999,
    });

    expect(
      result.ok && result.value.kind,
      '`gh` は答えている。その答えに無かったのは、観測できた事実である',
    ).toBe('absent');
  });

  it('尋ねられなければ、観測できなかったと言う', async () => {
    const { tracker } = fakeTracker([]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(
      result.ok && result.value.kind,
      '空の並びにすると、誰も何も言っていない課題に見える',
    ).toBe('unobservable');
  });

  it('GitHub のリポジトリでなければ、尋ねない', async () => {
    const { tracker, asked } = fakeTracker([pageOf([], null)]);

    const result = await useCaseWith(tracker, gitWithoutRemote()).execute({
      projectPath: '/work/whatever',
      number: 1,
    });

    expect(asked, '尋ね先が無いのに `gh` を起こさない').toEqual([]);
    expect(
      result.ok && result.value.kind,
      'remote を持たないのは「やり取りが読めなかった」ではない',
    ).toBe('absent');
  });

  it('次のページの在りかを渡して、続きを読む', async () => {
    const { tracker, asked } = fakeTracker([
      pageOf([commentAt('2026-08-01T00:00:00Z', '1 枚目')], 'cur1'),
      pageOf([commentAt('2026-08-01T01:00:00Z', '2 枚目')], null),
    ]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(asked.map((request) => request.cursor)).toEqual([null, 'cur1']);
    if (result.ok && result.value.kind === 'observed') {
      expect(result.value.value.entries).toHaveLength(2);
      expect(result.value.value.truncated, '最後まで読めたのに切れたと言わない').toBe(false);
    }
  });

  it('ページ数の上限に当たったことを言う', async () => {
    const { tracker, asked } = fakeTracker(
      Array.from({ length: 9 }, (_unused, index) =>
        pageOf([commentAt('2026-08-01T00:00:00Z', `${index}`)], `cur${index}`),
      ),
    );

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(asked.length, '際限なく辿らない').toBe(5);
    expect(
      result.ok && result.value.kind === 'observed' && result.value.value.truncated,
      '黙って切ると、上限より後ろの発言が「無かった」ことになる',
    ).toBe(true);
  });

  it('途中で尋ねられなくなっても、観えたぶんは捨てない', async () => {
    const { tracker } = fakeTracker([
      pageOf([commentAt('2026-08-01T00:00:00Z', '1 枚目')], 'cur1'),
    ]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(result.ok && result.value.kind).toBe('observed');
    if (result.ok && result.value.kind === 'observed') {
      expect(result.value.value.entries, '観えた 1 件を捨てると、やり取りが空になる').toHaveLength(
        1,
      );
      expect(result.value.value.truncated, 'その先を読んでいないことは言う').toBe(true);
    }
  });

  it('途中のページが読めなくなっても、観えたぶんは捨てない', async () => {
    const { tracker } = fakeTracker([
      pageOf([commentAt('2026-08-01T00:00:00Z', '1 枚目')], 'cur1'),
      'これは JSON ではない',
    ]);

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    if (result.ok && result.value.kind === 'observed') {
      expect(result.value.value.entries).toHaveLength(1);
      expect(result.value.value.truncated).toBe(true);
    } else {
      expect.unreachable('1 ページ目は観えている');
    }
  });
});

/* やり取りに出てくる人の顔。**一覧に居るのは担当と書いた人だけである** —— ラベルを付けた人も
   改題した人も一覧には居ないので、ここで覚えさせておかないと、その人の顔だけが引けない。 */
describe('やり取りで名指された人の顔', () => {
  const labeledBy = (login: string) => ({
    __typename: 'LabeledEvent',
    createdAt: '2026-08-01T00:00:00Z',
    actor: { login, avatarUrl: `https://avatars.githubusercontent.com/u/1?s=48` },
    label: { name: 'ui', color: 'd73a4a' },
  });

  it('読めた人を、顔を引ける先として覚えさせる', async () => {
    const { tracker } = fakeTracker([pageOf([labeledBy('octocat')], null)]);
    const { avatars, learned } = fakeAvatars();

    await useCaseWith(tracker, undefined, avatars).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(learned, '覚えさせないと、イベントの行だけ顔が抜ける').toEqual(['octocat']);
  });

  /* 担当にされた人は、そのイベントを起こした人ではない。**起こした人しか覚えないと、
     自分では何もしていない担当の顔だけが引けない。** */
  it('担当にされた人も、起こした人と一緒に覚えさせる', async () => {
    const assigned = {
      __typename: 'AssignedEvent',
      createdAt: '2026-08-01T00:00:00Z',
      actor: { login: 'rin_sato', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=48' },
      assignee: { login: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/2?s=48' },
    };
    const { tracker } = fakeTracker([pageOf([assigned], null)]);
    const { avatars, learned } = fakeAvatars();

    await useCaseWith(tracker, undefined, avatars).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(learned).toEqual(['rin_sato', 'octocat']);
  });

  /* 途中で `gh` が答えなくなっても、そこまでは観えている。**観えたぶんの顔は引けるべきである**
     —— 覚えさせないと、読めたやり取りの中で顔だけが出ない行が混ざる。 */
  it('途中で切れても、そこまでに読めた人は覚えさせる', async () => {
    const { tracker } = fakeTracker([pageOf([labeledBy('octocat')], 'CURSOR')]);
    const { avatars, learned } = fakeAvatars();

    const result = await useCaseWith(tracker, undefined, avatars).execute({
      projectPath: '/work/glasshive',
      number: 13,
    });

    expect(result.ok && result.value.kind === 'observed' && result.value.value.truncated).toBe(
      true,
    );
    expect(learned).toEqual(['octocat']);
  });
});
