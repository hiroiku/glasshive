import { describe, expect, it } from 'vitest';
import { absent, observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import { streamGithubIssueDiscussion } from '~/interface/controllers/issues/issues.controller.ts';

/* 届いたリクエストを、やり取りへの問いとして読めるときだけ受ける。

   ここで見るのは 2 つである。**プロジェクトはこちらの索引から引く**こと、そして
   **番号は一覧に出る形のものだけを通す**こと。どちらもここでしか止められない。 */

/* 相手の形は、検証する `streamGithubIssueDiscussion` 自身から引く。書き写して持てば、
   形が変わったときに片方だけ古いまま残る。 */
type Deps = Parameters<typeof streamGithubIssueDiscussion>[0];
type DiscussionUseCase = Deps['discussion'];
type DiscussionInput = Parameters<DiscussionUseCase['stream']>[0];

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
      watchedIds: new Set(['glasshive']),
      transcriptFiles: new Set<string>(),
      groups: [],
    });
  },
};

/** 一覧・本文・記録は、やり取りの検証では起こさない */
const unusedList: Deps['list'] = {
  stream() {
    throw new Error('not called');
  },
};
const unusedBody: Deps['body'] = {
  async execute() {
    throw new Error('not called');
  },
};
const unusedEvents: Deps['events'] = {
  stream() {
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

/* 断れるのは最初のチャンクより前だけである。1 つでも配った後は HTTP のステータスが既に
   決まっているので、そこで投げてもエラーコードから引いた status にはならない。

   逆に、ページが読めなかったことはここでは断らない —— それは観測の結果なので、最初の 1 枚が
   `state` として運ぶ。 */
describe('やり取りを、読めたページから配る', () => {
  /** 配ったチャンク。投げられたなら、そこまでに配れたものと一緒に返す */
  async function drain(input: unknown, discussion: DiscussionUseCase) {
    const chunks: unknown[] = [];
    try {
      for await (const chunk of streamGithubIssueDiscussion(depsWith(discussion), input)) {
        chunks.push(chunk);
      }
      return { chunks, threw: false };
    } catch {
      return { chunks, threw: true };
    }
  }

  /** 起こされたかどうかだけを控える偽のユースケース */
  function spyStream(chunks: readonly unknown[] = []) {
    const seen: DiscussionInput[] = [];
    const useCase: DiscussionUseCase = {
      async *stream(input) {
        seen.push(input);
        for (const chunk of chunks) yield chunk as never;
      },
    };
    return { useCase, seen };
  }

  it('索引から引いたパスと、受け取った番号を渡す', async () => {
    const { useCase, seen } = spyStream();

    const { threw } = await drain({ projectId: 'glasshive', number: 13 }, useCase);

    expect(threw).toBe(false);
    expect(
      seen,
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
  ])('%s なら、`gh` を起こす前に断る', async (_name, number) => {
    const { useCase, seen } = spyStream();

    const { chunks, threw } = await drain({ projectId: 'glasshive', number }, useCase);

    expect(threw, '受理していないことを、配り始めた後で言うことになる').toBe(true);
    expect(chunks, '1 つでも配った後の断りは、エラーコードから引いた status にならない').toEqual(
      [],
    );
    expect(seen, '一覧に出ない番号で `gh` を起こしている').toEqual([]);
  });

  it('一覧に無い id も、配り始める前に断る', async () => {
    const { useCase, seen } = spyStream();

    const { chunks, threw } = await drain({ projectId: '../etc', number: 13 }, useCase);

    expect(threw).toBe(true);
    expect(chunks).toEqual([]);
    expect(seen, '尋ね先を決めるのは観測したプロジェクトであって、尋ねてきた側ではない').toEqual(
      [],
    );
  });

  /* ページが読めなかったことは断りではない。**503 にすると、`gh` が答えなかったことと、
     こちらが受理しなかったことが同じ形になる。** */
  it('ページが読めなかったことは、断りではなく最初の 1 枚が運ぶ', async () => {
    const { useCase } = spyStream([
      { kind: 'head', head: absent('no-source') },
      { kind: 'complete', truncated: false },
    ]);

    const { chunks, threw } = await drain({ projectId: 'glasshive', number: 13 }, useCase);

    expect(threw).toBe(false);
    expect(chunks).toEqual([
      {
        kind: 'head',
        head: {
          state: 'absent',
          reason: 'no-source',
          entries: [],
          truncated: false,
          walked: false,
        },
      },
      { kind: 'complete', truncated: false },
    ]);
  });
});
