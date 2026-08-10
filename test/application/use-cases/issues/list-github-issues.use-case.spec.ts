import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import { createListGithubIssues } from '~/application/use-cases/issues/list-github-issues.use-case.ts';

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

const pageOf = (numbers: readonly number[], next: string | null) =>
  JSON.stringify({
    data: {
      repository: {
        issues: {
          pageInfo: { hasNextPage: next !== null, endCursor: next },
          nodes: numbers.map((number) => ({
            number,
            title: `issue ${number}`,
            state: 'OPEN',
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
    /* 一覧の呼び出しは本文を尋ねない。**尋ねたら落ちるようにしておく** —— 尋ね始めたら、
       それは一覧に本文を混ぜ戻したということである */
    async fetchIssueBody() {
      throw new Error('一覧は本文を尋ねない');
    },
  };
  return { tracker, asked };
}

/* 顔は課題の一覧そのものには関わらない。呼ばれたことだけ数える偽物を置く */
function fakeAvatars() {
  const remembered: number[] = [];
  const avatars: AvatarCacheService = {
    remember: (ledger) => remembered.push(ledger.issues.length),
    warm: () => undefined,
    read: async () => absent('no-source'),
  };
  return { avatars, remembered };
}

describe('GitHub の課題を一覧にする', () => {
  it('remote から owner とリポジトリ名を引いて尋ねる', async () => {
    const { tracker, asked } = fakeTracker([pageOf([1], null)]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git\n'),
      tracker,
    });

    await useCase.execute({ projectPath: '/work/glasshive', includeClosed: false });

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

    await useCase.execute({ projectPath: '/work/kuden-os', includeClosed: false });

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

    await useCase.execute({ projectPath: '/work/the-tool', includeClosed: false });

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

    await useCase.execute({ projectPath: '/work/the-tool', includeClosed: false });

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

    const result = await useCase.execute({ projectPath: '/work/tool', includeClosed: false });

    expect(result.ok && result.value.kind).toBe('absent');
    expect(asked, 'GitHub でない相手に尋ねに行かない').toHaveLength(0);
  });

  it('remote を持たないリポジトリを、読めなかったことにしない', async () => {
    const { tracker } = fakeTracker([]);
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithoutRemote(),
      tracker,
    });

    const result = await useCase.execute({ projectPath: '/work/local', includeClosed: false });

    expect(
      result.ok && result.value.kind,
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

    const result = await useCase.execute({ projectPath: '/work/glasshive', includeClosed: false });

    expect(asked[1]?.cursor, '前のページが答えた続きの位置から尋ねる').toBe('cur1');
    expect(result.ok && result.value.kind === 'observed' && result.value.value.issues).toHaveLength(
      3,
    );
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

    const result = await useCase.execute({ projectPath: '/work/glasshive', includeClosed: false });

    expect(asked.length, '際限なく辿らない').toBe(5);
    expect(
      result.ok && result.value.kind === 'observed' && result.value.value.truncated,
      '黙って切ると、上限より後ろの課題が「無かった」ことになる',
    ).toBe(true);
  });

  it('1 ページ目で尋ねられなければ、観測できなかったと言う', async () => {
    const tracker: IssueTrackerIntegration = {
      async fetchIssuePage() {
        return unobservable(new TrackerUnreachable('gh exited non-zero'));
      },
      /* 一覧の呼び出しは本文を尋ねない。**尋ねたら落ちるようにしておく** —— 尋ね始めたら、
       それは一覧に本文を混ぜ戻したということである */
      async fetchIssueBody() {
        throw new Error('一覧は本文を尋ねない');
      },
    };
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await useCase.execute({ projectPath: '/work/glasshive', includeClosed: false });

    expect(
      result.ok && result.value.kind,
      '空の一覧にすると、課題が 1 件も無いリポジトリに見える',
    ).toBe('unobservable');
  });

  it('途中で尋ねられなくなっても、観えたぶんは捨てない', async () => {
    let calls = 0;
    const tracker: IssueTrackerIntegration = {
      async fetchIssuePage() {
        calls++;
        if (calls === 1) return observed(pageOf([1, 2], 'cur1'));
        return unobservable(new TrackerUnreachable('rate limited'));
      },
      /* 一覧の呼び出しは本文を尋ねない。**尋ねたら落ちるようにしておく** —— 尋ね始めたら、
       それは一覧に本文を混ぜ戻したということである */
      async fetchIssueBody() {
        throw new Error('一覧は本文を尋ねない');
      },
    };
    const useCase = createListGithubIssues({
      avatars: fakeAvatars().avatars,
      git: gitWithRemote('git@github.com:hiroiku/glasshive.git'),
      tracker,
    });

    const result = await useCase.execute({ projectPath: '/work/glasshive', includeClosed: false });

    expect(result.ok && result.value.kind).toBe('observed');
    if (result.ok && result.value.kind === 'observed') {
      expect(result.value.value.issues, '観えた 2 件を捨てると、一覧が空になる').toHaveLength(2);
      expect(result.value.value.truncated, 'その先を読んでいないことは言う').toBe(true);
    }
  });
});
