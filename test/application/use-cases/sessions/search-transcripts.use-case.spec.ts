import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type {
  TranscriptRepository,
  TranscriptStat,
  TranscriptWindow,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createTranscriptSearch } from '~/application/services/sessions/transcript-search.service.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { ProjectTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';
import { createSearchTranscripts } from '~/application/use-cases/sessions/search-transcripts.use-case.ts';

/* 検索は区切って読む。ここで見るのは、区切りをまたいでも取りこぼしと重複が出ないこと、
   短すぎる語では `transcript` に触れもしないこと、観測できなかったことを潰さないことである。

   木は「どの `transcript` がこのプロジェクトのものか」しか渡さないので、
   欄はほとんど空のままでよい。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');

interface Fake {
  readonly stat: Observation<TranscriptStat>;
  readonly tail: Observation<TranscriptWindow>;
}

const text = (body: string, mtimeMs: number): Fake => ({
  stat: observed({ mtimeMs, sizeBytes: body.length }),
  tail: observed({ text: body, complete: true }),
});

/** セッション 1 つ。検索が見るのは `file` と `subagents` だけである */
function sessionOf(file: string): ProjectTree['projects'][number]['sessions'][number] {
  return {
    id: file,
    file,
    state: 'ended',
    awaiting: null,
    title: null,
    startedRaw: null,
    lastActivityMs: NOW,
    ownMtimeMs: NOW,
    tokens: absent('empty'),
    model: null,
    effort: null,
    gitBranch: null,
    cwd: null,
    issues: [],
    current: null,
    activity: absent('empty'),
    sizeBytes: 0,
    subagents: [],
    subagentsWalked: observed(0),
  };
}

function createUseCase(files: Readonly<Record<string, Fake>>) {
  const opened: string[] = [];
  const missing: Fake = { stat: absent('no-source'), tail: absent('no-source') };
  const transcripts: TranscriptRepository = {
    async listTranscripts() {
      return observed([]);
    },
    async statTranscript(file) {
      return (files[file] ?? missing).stat;
    },
    async readHead() {
      return observed({ text: '', complete: true });
    },
    async readTail(at) {
      opened.push(at.file);
      return (files[at.file] ?? missing).tail;
    },
    async canonicalize(target) {
      return observed(target);
    },
  };

  const get = async (): Promise<Result<ProjectTree>> =>
    ok({
      generatedAtMs: NOW,
      activeThresholdMs: 60_000,
      sources: observed(1),
      processes: observed(0),
      projects: [
        {
          id: 'hive',
          slugs: ['hive'],
          path: '/w',
          canonicalPath: '/w',
          name: 'hive',
          liveProcessCount: 0,
          latestActivityMs: NOW,
          recentTokens: absent('empty'),
          walked: observed(Object.keys(files).length),
          sessions: Object.keys(files).map(sessionOf),
        },
      ],
    });

  const tree: TreeSnapshotService = {
    get,
    // 検索は途中経過を汲まない。1 枚を返すだけにしておく
    async *stream() {
      yield* [];
      return await get();
    },
    invalidate() {},
  };

  return {
    opened,
    useCase: createSearchTranscripts({ tree, search: createTranscriptSearch({ transcripts }) }),
  };
}

/** 新しい順に `a` `b` `c` `d` と並ぶ 4 本。当たるのは `a` と `c` だけ */
const four = {
  '/w/a.jsonl': text('needle', NOW - 1000),
  '/w/b.jsonl': text('nothing here', NOW - 2000),
  '/w/c.jsonl': text('NEEDLE', NOW - 3000),
  '/w/d.jsonl': text('nothing here', NOW - 4000),
};

describe('`transcript` を横断して語を探す', () => {
  it('区切りを進めると、重複も取りこぼしも無く全部を見る', async () => {
    const { useCase, opened } = createUseCase(four);

    const found: string[] = [];
    let offset = 0;
    let rounds = 0;
    for (;;) {
      const answer = await useCase.execute({ projectId: 'hive', query: 'needle', offset }, NOW);
      expect(answer.ok).toBe(true);
      if (!answer.ok || answer.value.kind !== 'observed') break;
      const page = answer.value.value;
      found.push(...page.files);
      expect(page.total).toBe(4);
      rounds += 1;
      if (page.done) break;
      offset = page.scanned;
    }

    expect(rounds, '区切りは 48 本なので、4 本は 1 回で読み切る').toBe(1);
    expect(found).toEqual(['/w/a.jsonl', '/w/c.jsonl']);
    expect(opened, '新しい順に開くので、いま関わりの深いものから先に出る').toEqual([
      '/w/a.jsonl',
      '/w/b.jsonl',
      '/w/c.jsonl',
      '/w/d.jsonl',
    ]);
  });

  it('区切りの途中から頼まれても、そこから続きを読む', async () => {
    const { useCase, opened } = createUseCase(four);

    const answer = await useCase.execute({ projectId: 'hive', query: 'needle', offset: 2 }, NOW);
    expect(answer.ok && answer.value).toEqual({
      kind: 'observed',
      value: { files: ['/w/c.jsonl'], scanned: 4, total: 4, done: true },
    });
    expect(opened, '既に見た `transcript` は二度開かない').toEqual(['/w/c.jsonl', '/w/d.jsonl']);
  });

  it('短すぎる語では `transcript` に触れもしない', async () => {
    const { useCase, opened } = createUseCase(four);

    const answer = await useCase.execute({ projectId: 'hive', query: 'n', offset: 0 }, NOW);
    expect(
      answer.ok && answer.value,
      '断らずに、探した結果として何も当たらなかったことにする',
    ).toEqual({
      kind: 'observed',
      value: { files: [], scanned: 0, total: 0, done: true },
    });
    expect(opened).toEqual([]);
  });

  it('7 日より前に書き終わった `transcript` は候補に入らない', async () => {
    const { useCase, opened } = createUseCase({
      '/w/a.jsonl': text('needle', NOW - 8 * 86_400_000),
    });

    const answer = await useCase.execute({ projectId: 'hive', query: 'needle', offset: 0 }, NOW);
    expect(answer.ok && answer.value).toEqual({
      kind: 'observed',
      value: { files: [], scanned: 0, total: 0, done: true },
    });
    expect(opened).toEqual([]);
  });

  it('読めない `transcript` があれば、当たらなかったことにしない', async () => {
    const { useCase } = createUseCase({
      '/w/a.jsonl': {
        stat: observed({ mtimeMs: NOW, sizeBytes: 10 }),
        tail: unobservable(new UnexpectedError('読めない')),
      },
    });

    const answer = await useCase.execute({ projectId: 'hive', query: 'needle', offset: 0 }, NOW);
    expect(answer.ok && answer.value.kind, '観測できなかったことを「無かった」に潰さない').toBe(
      'unobservable',
    );
  });

  it('観測していないプロジェクトは断る', async () => {
    const { useCase } = createUseCase(four);

    const answer = await useCase.execute({ projectId: 'other', query: 'needle', offset: 0 }, NOW);
    expect(answer.ok).toBe(false);
  });
});
