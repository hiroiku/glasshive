import { describe, expect, it } from 'vitest';
import { absent, observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import { getGithubIssueDiscussion } from '~/interface/controllers/issues/issues.controller.ts';

/* 届いたリクエストを、やり取りへの問いとして読めるときだけ受ける。

   ここで見るのは 2 つである。**プロジェクトはこちらの索引から引く**こと、そして
   **番号は一覧に出る形のものだけを通す**こと。どちらもここでしか止められない。 */

/* 相手の形は、検証する `getGithubIssueDiscussion` 自身から引く。書き写して持てば、
   形が変わったときに片方だけ古いまま残る。 */
type Deps = Parameters<typeof getGithubIssueDiscussion>[0];
type DiscussionUseCase = Deps['discussion'];
type DiscussionInput = Parameters<DiscussionUseCase['execute']>[0];

const PROJECT_PATH = '/nest/glasshive';

/** 索引 1 枚。プロジェクトが 1 つだけ在り、そのパスが引ける */
const index: Deps['index'] = {
  invalidate: () => undefined,
  async get() {
    return ok({
      index: {
        generatedAtMs: 0,
        activeThresholdMs: 60_000,
        sources: observed(1),
        processes: observed(0),
        stubs: [
          {
            id: 'glasshive',
            slugs: ['-nest-glasshive'],
            path: PROJECT_PATH,
            canonicalPath: PROJECT_PATH,
            name: 'glasshive',
            liveProcessCount: 0,
            latestActivityMs: 0,
            transcriptCount: 0,
            walked: observed(0),
          },
        ],
      },
      transcriptFiles: new Set<string>(),
      groups: [],
    });
  },
};

/** 一覧と本文は、やり取りの検証では起こさない */
const unusedList: Deps['list'] = {
  async execute() {
    throw new Error('not called');
  },
  stream() {
    throw new Error('not called');
  },
};
const unusedBody: Deps['body'] = {
  async execute() {
    throw new Error('not called');
  },
};

/** 内側へ渡った問いを控える偽のユースケース */
function spyDiscussion(): DiscussionUseCase & { readonly seen: DiscussionInput[] } {
  const seen: DiscussionInput[] = [];
  return {
    seen,
    async execute(input) {
      seen.push(input);
      return ok(observed({ entries: [], truncated: false }));
    },
  };
}

const unusedEvents: Deps['events'] = {
  async execute() {
    throw new Error('not called');
  },
};

const depsWith = (discussion: DiscussionUseCase): Deps => ({
  list: unusedList,
  body: unusedBody,
  discussion,
  events: unusedEvents,
  index,
});

describe('やり取りのリクエストを検証する', () => {
  it('索引から引いたパスと、受け取った番号を渡す', async () => {
    const discussion = spyDiscussion();

    const response = await getGithubIssueDiscussion(depsWith(discussion), {
      projectId: 'glasshive',
      number: 13,
    });

    expect(response.ok).toBe(true);
    expect(
      discussion.seen,
      'パスを受け取ると、画像 1 枚を読み込ませるだけでローカルのどこを尋ねるかを外から決められる',
    ).toEqual([{ projectPath: PROJECT_PATH, number: 13 }]);
  });

  it.each([
    ['番号が無い', undefined],
    ['番号が文字列', '13'],
    ['番号が小数', 1.5],
    ['番号が 0', 0],
    ['番号が負', -1],
    ['番号が安全な整数を超える', Number.MAX_SAFE_INTEGER + 2],
  ])('%s なら、gh を起こす前に断る', async (_name, number) => {
    const discussion = spyDiscussion();

    const response = await getGithubIssueDiscussion(depsWith(discussion), {
      projectId: 'glasshive',
      number,
    });

    expect(response.ok).toBe(false);
    expect(discussion.seen).toEqual([]);
  });

  it('一覧に無い id は断る', async () => {
    const discussion = spyDiscussion();

    const response = await getGithubIssueDiscussion(depsWith(discussion), {
      projectId: '../etc',
      number: 13,
    });

    expect(response.ok).toBe(false);
    expect(
      discussion.seen,
      '尋ね先を決めるのは観測したプロジェクトであって、尋ねてきた側ではない',
    ).toEqual([]);
  });

  it('尋ねる先が無かったことを、応答の state で言う', async () => {
    const noRepository: DiscussionUseCase = {
      async execute() {
        return ok(absent('no-source'));
      },
    };

    const response = await getGithubIssueDiscussion(depsWith(noRepository), {
      projectId: 'glasshive',
      number: 13,
    });

    expect(response.ok && response.body).toEqual({
      state: 'absent',
      reason: 'no-source',
      entries: [],
      truncated: false,
    });
  });
});
