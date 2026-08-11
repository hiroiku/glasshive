import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type {
  IssueBodyRequest,
  IssueTrackerIntegration,
} from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import { createGetGithubIssueBody } from '~/application/use-cases/issues/get-github-issue-body.use-case.ts';

/* 課題 1 件の本文は、一覧とは別の呼び出しで引く。

   一覧が本文を運ばないのは大きさのためであって、持てないからではない。**1 件を開いたときに
   読めないままにすると**、一覧には並ぶのに開くと何も書かれていない課題になる。 */

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

const answerOf = (body: unknown) => JSON.stringify({ data: { repository: { issue: { body } } } });

function fakeTracker(text: string | (() => never)) {
  const asked: IssueBodyRequest[] = [];
  const tracker: IssueTrackerIntegration = {
    async fetchIssuePage() {
      throw new Error('本文の呼び出しは一覧を尋ねない');
    },
    async fetchIssueBody(request) {
      asked.push(request);
      if (typeof text !== 'string') return text();
      return observed(text);
    },
    async fetchIssueDiscussion() {
      throw new Error('本文の呼び出しはやり取りを尋ねない');
    },
    async fetchIssueEvents() {
      throw new Error('ここはイベントを尋ねない');
    },
  };
  return { tracker, asked };
}

const useCaseWith = (
  tracker: IssueTrackerIntegration,
  git = gitWithRemote('git@github.com:hiroiku/glasshive.git'),
) => createGetGithubIssueBody({ git, tracker });

describe('GitHub の課題 1 件の本文', () => {
  it('remote が指すリポジトリの、その番号を尋ねる', async () => {
    const { tracker, asked } = fakeTracker(answerOf('# 見出し\n本文'));

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 209,
    });

    expect(asked).toEqual([{ owner: 'hiroiku', name: 'glasshive', number: 209 }]);
    expect(result.ok && result.value.kind === 'observed' && result.value.value).toBe(
      '# 見出し\n本文',
    );
  });

  it('本文の無い課題を、読めなかったことにしない', async () => {
    const { tracker } = fakeTracker(answerOf(''));

    const result = await useCaseWith(tracker).execute({
      projectPath: '/work/glasshive',
      number: 1,
    });

    expect(
      result.ok && result.value.kind,
      '空の本文が書かれている課題と、読みに行けなかった課題は違う',
    ).toBe('observed');
    expect(result.ok && result.value.kind === 'observed' && result.value.value).toBe('');
  });

  it('その番号が応答に無ければ、無かったと言う', async () => {
    const { tracker } = fakeTracker(JSON.stringify({ data: { repository: { issue: null } } }));

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
    const { tracker } = fakeTracker(() => {
      throw new Error('unreachable');
    });
    const failing: IssueTrackerIntegration = {
      ...tracker,
      async fetchIssueBody() {
        return unobservable(new TrackerUnreachable('gh exited non-zero'));
      },
    };

    const result = await useCaseWith(failing).execute({
      projectPath: '/work/glasshive',
      number: 209,
    });

    expect(result.ok && result.value.kind).toBe('unobservable');
  });

  it('GitHub のリポジトリでなければ、尋ねない', async () => {
    const { tracker, asked } = fakeTracker(answerOf('本文'));

    const result = await useCaseWith(tracker, gitWithoutRemote()).execute({
      projectPath: '/work/whatever',
      number: 1,
    });

    expect(asked, '尋ね先が無いのに `gh` を起こさない').toEqual([]);
    expect(
      result.ok && result.value.kind,
      'remote を持たないのは「本文が読めなかった」ではない',
    ).toBe('absent');
  });
});
