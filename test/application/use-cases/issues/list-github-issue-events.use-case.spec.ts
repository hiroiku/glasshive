import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type {
  IssueEventsRequest,
  IssueTrackerIntegration,
} from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import { createListGithubIssueEvents } from '~/application/use-cases/issues/list-github-issue-events.use-case.ts';

/* 一覧に出ている課題に起きたことは、一覧とは別に引く。

   ここで見るのは 3 つ —— 一覧と同じ件数で尋ねているか、途中で読めなくなったときに読めた
   ぶんを捨てていないか、そして全部を辿れなかったことを言えているか。 */

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

const pageOf = (numbers: readonly number[], next: string | null) =>
  JSON.stringify({
    data: {
      repository: {
        issues: {
          pageInfo: { hasNextPage: next !== null, endCursor: next },
          nodes: numbers.map((number) => ({
            number,
            timelineItems: {
              totalCount: 1,
              nodes: [{ __typename: 'ClosedEvent', createdAt: '2026-08-01T00:00:00Z' }],
            },
          })),
        },
      },
    },
  });

/** ページごとに答えを決めておくトラッカー。何をどう尋ねられたかも残す */
function fakeTracker(pages: readonly string[]) {
  const asked: IssueEventsRequest[] = [];
  const tracker: IssueTrackerIntegration = {
    async fetchIssuePage() {
      throw new Error('イベントの呼び出しは一覧を尋ねない');
    },
    async fetchIssueBody() {
      throw new Error('イベントの呼び出しは本文を尋ねない');
    },
    async fetchIssueDiscussion() {
      throw new Error('イベントの呼び出しはやり取りを尋ねない');
    },
    async fetchIssueEvents(request) {
      asked.push(request);
      const page = pages[asked.length - 1];
      if (page === undefined) return unobservable(new TrackerUnreachable('尋ねすぎ'));
      return observed(page);
    },
  };
  return { tracker, asked };
}

const run = async (
  tracker: IssueTrackerIntegration,
  git = gitWithRemote('git@github.com:a/b.git'),
) => createListGithubIssueEvents({ git, tracker }).execute({ projectPath: '/w' });

describe('一覧に出ている課題のイベントを引く', () => {
  it('一覧と同じ件数で、解決した owner と名前を尋ねる', async () => {
    const { tracker, asked } = fakeTracker([pageOf([101, 102], null)]);

    const answer = await run(tracker);

    expect(asked[0]?.owner).toBe('a');
    expect(asked[0]?.name).toBe('b');
    expect(asked[0]?.pageSize, '一覧と違う件数で尋ねると、返る課題が一覧とずれる').toBe(100);
    expect(asked[0]?.cursor).toBeNull();
    expect(answer.ok && answer.value.kind).toBe('observed');
  });

  it('課題ごとのイベントを、一覧の行と突き合わせる鍵ごと持ち帰る', async () => {
    const { tracker } = fakeTracker([pageOf([101, 102], null)]);

    const answer = await run(tracker);

    expect(answer.ok && answer.value.kind === 'observed' && answer.value.value.issues).toEqual([
      { id: '#101', events: [{ at: '2026-08-01T00:00:00Z', kind: 'closed' }], truncated: false },
      { id: '#102', events: [{ at: '2026-08-01T00:00:00Z', kind: 'closed' }], truncated: false },
    ]);
  });

  it('続きの位置を渡して、次のページも辿る', async () => {
    const { tracker, asked } = fakeTracker([pageOf([101], 'Y3Vyc29y'), pageOf([102], null)]);

    const answer = await run(tracker);

    expect(asked[1]?.cursor).toBe('Y3Vyc29y');
    expect(answer.ok && answer.value.kind === 'observed' && answer.value.value.complete).toBe(true);
  });

  it('2 ページ目で読めなくなっても、読めたぶんは捨てない', async () => {
    // 2 枚目を用意しないので、2 度目の問い合わせが `unobservable` になる
    const { tracker } = fakeTracker([pageOf([101], 'Y3Vyc29y')]);

    const answer = await run(tracker);
    const value = answer.ok && answer.value.kind === 'observed' ? answer.value.value : null;

    expect(value?.issues.map((issue) => issue.id)).toEqual(['#101']);
    expect(
      value?.complete,
      '全部は辿れなかったことを言わないと、点の無い行の意味が決まらない',
    ).toBe(false);
  });

  it('1 ページ目で読めなかったら、観測そのものが成り立っていない', async () => {
    const { tracker } = fakeTracker([]);

    const answer = await run(tracker);

    expect(
      answer.ok && answer.value.kind,
      '空の一覧を返すと、読めなかったことが「何も起きていない」に化ける',
    ).toBe('unobservable');
  });

  it('1 ページ目が読めない形なら、全部を辿れなかったものとして返す', async () => {
    const { tracker } = fakeTracker(['{']);

    const answer = await run(tracker);
    const value = answer.ok && answer.value.kind === 'observed' ? answer.value.value : null;

    expect(value?.issues).toEqual([]);
    expect(value?.complete).toBe(false);
  });

  it('GitHub を指していないプロジェクトは、読めなかったのではない', async () => {
    const { tracker } = fakeTracker([pageOf([101], null)]);

    const answer = await run(tracker, gitWithoutRemote());

    expect(answer.ok && answer.value.kind).toBe('absent');
  });
});
