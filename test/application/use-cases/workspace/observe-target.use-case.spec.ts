import { describe, expect, it } from 'vitest';
import { observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import type {
  TranscriptIndexService,
  TranscriptIndexSnapshot,
} from '~/application/services/sessions/transcript-index.service.ts';
import type { TargetRootService } from '~/application/services/workspace/target-root.service.ts';
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
const indexOf = (stubs: readonly ProjectStub[]): TranscriptIndexService => ({
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
  invalidate() {},
});

const rootOf = (root: {
  requestedPath: string;
  rootPath: string;
  name: string;
  worktrees: readonly string[];
}): TargetRootService => ({ get: async () => root });

describe('名指されたディレクトリが指すプロジェクト', () => {
  it('開くプロジェクトと、同じリポジトリの残りを答える', async () => {
    const target = createObserveTarget({
      root: rootOf({
        requestedPath: '/src/repo',
        rootPath: '/src/repo',
        name: 'repo',
        worktrees: ['/src/repo-wt'],
      }),
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
      root: rootOf({
        requestedPath: '/src/fresh',
        rootPath: '/src/fresh',
        name: 'fresh',
        worktrees: [],
      }),
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
      root: { get: async () => null },
      index: indexOf([stubOf('other', '/src/other')]),
    });

    const answer = await target.execute();

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value, '名指されていないことは、Overview を開くという答えである').toBe(null);
  });
});
