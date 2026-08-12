import { describe, expect, it } from 'vitest';
import { observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import type {
  TranscriptIndexService,
  TranscriptIndexSnapshot,
} from '~/application/services/sessions/transcript-index.service.ts';
import type {
  NamedDirectory,
  NamedDirectoryService,
} from '~/application/services/workspace/named-directory.service.ts';
import { createObserveTarget } from '~/application/use-cases/workspace/observe-target.use-case.ts';

/** 索引が並べる行の形は、索引そのものから引く。ここは domain を `import` できない */
type ProjectStub = TranscriptIndexSnapshot['index']['stubs'][number];

/* 名指されたディレクトリが指すプロジェクトを答える。

   索引だけで答える。**ここで木を組ませると、1 つのリポジトリを開くために
   `~/.claude/projects` を全部読み終える必要が出る。** */

const NOW = 1_700_000_000_000;

const stubOf = (id: string, canonicalPath: string, latestActivityMs = 0): ProjectStub => ({
  id,
  slugs: [id],
  path: canonicalPath,
  canonicalPath,
  name: canonicalPath.split('/').pop() ?? id,
  liveProcessCount: 0,
  latestActivityMs,
  transcriptCount: 1,
  walked: observed(1),
});

/** 索引 1 枚を返すだけの偽の相手。**木は組まれない** —— 組まれたらここで気づく */
function indexOf(stubs: readonly ProjectStub[]): TranscriptIndexService & { rebuilds: number } {
  return {
    rebuilds: 0,
    async get() {
      return ok({
        index: {
          generatedAtMs: NOW,
          activeThresholdMs: 60_000,
          sources: observed(stubs.length),
          processes: observed(0),
          stubs,
        },
        transcriptFiles: new Set<string>(),
        groups: [],
      });
    },
    invalidate() {
      this.rebuilds += 1;
    },
  };
}

const directoryOf = (rootPath: string, worktrees: readonly string[] = []): NamedDirectory => ({
  requestedPath: rootPath,
  rootPath,
  name: rootPath.split('/').pop() ?? rootPath,
  worktrees,
});

/** 起動のときの相手と、あとから伝えられた相手を分けて答える偽の相手 */
const namedOf = (
  launched: NamedDirectory | null,
  told: Record<string, NamedDirectory> = {},
): NamedDirectoryService => ({
  launched: async () => launched,
  name: async (path) => told[path] ?? null,
  all: async () => [...(launched === null ? [] : [launched]), ...Object.values(told)],
});

describe('名指されたディレクトリが指すプロジェクト', () => {
  it('開くプロジェクトと、同じリポジトリの残りを答える', async () => {
    const target = createObserveTarget({
      named: namedOf(directoryOf('/src/repo', ['/src/repo-wt'])),
      index: indexOf([
        stubOf('wt', '/src/repo-wt', 900),
        stubOf('repo', '/src/repo', 100),
        stubOf('other', '/src/other', 900),
      ]),
    });

    const answer = await target.execute();

    expect(answer.ok).toBe(true);
    if (!answer.ok || answer.value === null) throw new Error('答えが無い');
    expect(answer.value.projectId).toBe('repo');
    expect(
      answer.value.siblings.map((sibling) => sibling.id),
      '同じリポジトリに居るものだけを、ウィンドウの上に出す',
    ).toEqual(['wt']);
    expect(answer.value.siblings[0]?.name, '名前を添えないと、押す先が id でしか読めない').toBe(
      'repo-wt',
    );
  });

  /* まだ Claude Code を走らせていないリポジトリを名指すことは在る。**それは失敗ではない。**
     索引がそのディレクトリを載せていれば、開くプロジェクトはそこに在る。 */
  it('名指した場所に何も観測できていなければ、開くプロジェクトは無い', async () => {
    const target = createObserveTarget({
      named: namedOf(directoryOf('/src/fresh')),
      index: indexOf([stubOf('other', '/src/other', 900)]),
    });

    const answer = await target.execute();

    expect(answer.ok).toBe(true);
    if (!answer.ok || answer.value === null) throw new Error('答えが無い');
    expect(answer.value.projectId).toBe(null);
    expect(answer.value.name, '開くものが無くても、名指された相手の名前は答える').toBe('fresh');
  });

  it('名指されていなければ、答えは無い', async () => {
    const target = createObserveTarget({
      named: namedOf(null),
      index: indexOf([stubOf('other', '/src/other')]),
    });

    const answer = await target.execute();

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value, '名指されていないことは、Overview を開くという答えである').toBe(null);
  });

  /* 走っている glasshive は、あとからパスを伝えられる。**起動のときの相手ではなく、
     伝えられたほうを見る。** */
  it('パスを渡されたら、そのディレクトリを見る', async () => {
    const index = indexOf([stubOf('repo', '/src/repo'), stubOf('later', '/src/later')]);
    const target = createObserveTarget({
      named: namedOf(directoryOf('/src/repo'), { '/src/later': directoryOf('/src/later') }),
      index,
    });

    const answer = await target.execute('/src/later');

    expect(answer.ok).toBe(true);
    if (!answer.ok || answer.value === null) throw new Error('答えが無い');
    expect(answer.value.projectId).toBe('later');
    expect(
      index.rebuilds,
      '初めて聞いたディレクトリは索引にまだ載っていない。組み直さないと、観測できていないことになる',
    ).toBe(1);
  });

  it('渡されたパスを読み替えられなければ、答えは無い', async () => {
    const target = createObserveTarget({
      named: namedOf(directoryOf('/src/repo')),
      index: indexOf([stubOf('repo', '/src/repo')]),
    });

    const answer = await target.execute('src/repo');

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value, '起動のときの相手で代えると、伝えた相手と違うものが開く').toBe(null);
  });
});
