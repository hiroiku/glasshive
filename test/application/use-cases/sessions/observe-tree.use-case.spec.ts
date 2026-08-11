import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { AgentProcessIntegration } from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import type {
  SessionSource,
  TranscriptGroup,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createTranscriptDrafts } from '~/application/services/sessions/transcript-draft.service.ts';
import { createTranscriptIndex } from '~/application/services/sessions/transcript-index.service.ts';
import { createObserveTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* 木ひと目ぶんの組み立て。パースは下書きの側で確かめてあるので、
   ここで見るのは、走査できたかどうかの持ち回りと、パスの正規化である。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const ACTIVE_THRESHOLD_MS = 60_000;

const head = `${JSON.stringify({
  type: 'user',
  cwd: '/w/proj',
  timestamp: '2026-08-09T11:00:00.000Z',
  message: { content: 'はじめの一言' },
})}\n`;

const SESSION: SessionSource = {
  id: 'sess',
  fileName: 'sess.jsonl',
  file: '/root/-w-proj/sess.jsonl',
  mtimeMs: NOW,
  sizeBytes: head.length,
  subagents: [],
  subagentsWalked: absent('no-source'),
};

const GROUP: TranscriptGroup = {
  slug: '-w-proj',
  sessions: [SESSION],
  walked: observed(1),
};

function createStub(overrides: {
  readonly groups?: Observation<readonly TranscriptGroup[]>;
  readonly canonical?: Observation<string>;
  readonly processes?: Awaited<ReturnType<AgentProcessIntegration['list']>>;
}) {
  const asked: string[] = [];
  const transcripts: TranscriptRepository = {
    async listTranscripts() {
      return overrides.groups ?? observed([GROUP]);
    },
    async statTranscript() {
      return observed({ mtimeMs: NOW, sizeBytes: head.length });
    },
    async readHead() {
      return observed({ text: head, complete: true });
    },
    async readTail() {
      return observed({ text: '', complete: true });
    },
    async canonicalize(target) {
      asked.push(target);
      return overrides.canonical ?? observed('/real/w/proj');
    },
  };
  const processes: AgentProcessIntegration = {
    list: async () => overrides.processes ?? observed([]),
  };
  /* 索引と本読みは同じ `drafts` を分け合う。**分けると、索引が読んだ先頭と末尾を
     本読みがもう一度開く。** 本番の組み立てと同じ形にしておく。 */
  const drafts = createTranscriptDrafts({
    transcripts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
  });
  const index = createTranscriptIndex({
    transcripts,
    processes,
    drafts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
    clock: { now: () => NOW },
    // 覚えさせない。1 つのテストの中で 2 度観測したときに、1 度目の索引が返ると読み違える
    ttlMs: 0,
  });
  return {
    asked,
    observe: createObserveTree({
      index,
      drafts,
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
    }),
  };
}

const treeOf = async (stub: ReturnType<typeof createStub>) => {
  const result = await stub.observe.execute(NOW);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('木をひと目ぶん観測する', () => {
  it('呼び出しは必ず受理される。観測できなかったことは木の中に残る', async () => {
    const stub = createStub({
      groups: unobservable(new UnexpectedError('走査できない')),
    });

    const result = await stub.observe.execute(NOW);
    expect(result.ok, '観測できなかったことは断る理由ではない').toBe(true);
  });

  it('`~/.claude/projects` を走査できなかったことは、プロジェクトが無いことと分けて持つ', async () => {
    const walked = await treeOf(createStub({}));
    const blind = await treeOf(
      createStub({ groups: unobservable(new UnexpectedError('走査できない')) }),
    );

    expect(walked.sources).toEqual({ kind: 'observed', value: 1 });
    expect(blind.projects, '走査できなかった周でも、木の形そのものは返す').toEqual([]);
    expect(blind.sources.kind, 'どちらも空の一覧になる。この欄でしか見分けられない').toBe(
      'unobservable',
    );
  });

  it('読めなかったプロジェクトのディレクトリは、木から消さない', async () => {
    const closed: TranscriptGroup = {
      slug: '-w-closed',
      sessions: [],
      walked: unobservable(new UnexpectedError('開けない')),
    };

    const tree = await treeOf(createStub({ groups: observed([GROUP, closed]) }));

    expect(
      tree.projects.map((project) => project.id),
      '読めなかったことを「セッションが無かった」に倒すと、プロジェクトが黙って消える',
    ).toEqual(['-w-proj', '-w-closed']);
  });

  it('読めなかったプロジェクトのディレクトリは、木の欄でも読めなかったことにする', async () => {
    const closed: TranscriptGroup = {
      slug: '-w-closed',
      sessions: [],
      walked: unobservable(new UnexpectedError('開けない')),
    };

    const tree = await treeOf(createStub({ groups: observed([GROUP, closed]) }));
    const blind = tree.projects.find((project) => project.id === '-w-closed');

    expect(blind?.walked.kind, 'セッションが空な理由は、この欄にしか残らない').toBe('unobservable');
    expect(
      blind?.recentTokens.kind,
      '見に行けなかったことを「消費が無かった」と書くと、静かなプロジェクトとして並ぶ',
    ).toBe('unobservable');
  });

  it('走査できたプロジェクトの欄は、走査できたままにする', async () => {
    const tree = await treeOf(createStub({}));

    expect(tree.projects[0]?.walked).toEqual(observed(1));
    expect(tree.projects[0]?.recentTokens.kind, '走査できたなら、数はそのまま出せる').toBe(
      'observed',
    );
  });

  /* ディレクトリが mode 444 のとき、一覧は返るが 1 本ずつを見に行くところで落ちる。
     走査そのものは通っているので、「走査できたか」だけを見ていると、ここが黙って消える。 */
  it('走査は通っても、見えた `transcript` を載せられなかったプロジェクトは木に残す', async () => {
    const short: TranscriptGroup = {
      ...GROUP,
      slug: '-w-short',
      sessions: [],
      walked: observed(1),
    };

    const tree = await treeOf(createStub({ groups: observed([GROUP, short]) }));
    const blind = tree.projects.find((project) => project.id === '-w-short');

    expect(
      tree.projects.map((project) => project.id),
      '見えているのに載せられなかったことを「無かった」に倒すと、プロジェクトが消える',
    ).toEqual(['-w-proj', '-w-short']);
    expect(
      blind?.walked.kind,
      '`observed` のまま通すと、載せられなかった `transcript` が「無かった」に化ける',
    ).toBe('unobservable');
    expect(
      blind?.recentTokens.kind,
      '見に行けなかったことを「消費が無かった」と書くと、静かなプロジェクトとして並ぶ',
    ).toBe('unobservable');
  });

  it('子のディレクトリを走査できなかったことも、セッションの欄まで運ぶ', async () => {
    const blindChildren: TranscriptGroup = {
      ...GROUP,
      sessions: [{ ...SESSION, subagentsWalked: unobservable(new UnexpectedError('開けない')) }],
    };

    const tree = await treeOf(createStub({ groups: observed([blindChildren]) }));
    const session = tree.projects[0]?.sessions[0];

    expect(
      session?.subagentsWalked.kind,
      '子を呼ばなかったセッションと、子を数えられなかったセッションが同じ形になる',
    ).toBe('unobservable');
    expect(session?.subagents, '数えられなくてもセッションそのものは見えている').toEqual([]);
  });

  it('子を呼んでいないセッションは、子のディレクトリが無かったことにする', async () => {
    const tree = await treeOf(createStub({}));

    expect(
      tree.projects[0]?.sessions[0]?.subagentsWalked,
      '`subagents` のディレクトリが無いのは、読めなかったのではなく無かったのである',
    ).toEqual(absent('no-source'));
  });

  it('プロセスを数えられなかったことも、0 件と分けて持つ', async () => {
    const tree = await treeOf(
      createStub({
        processes: unobservable(new UnexpectedError('数えられない')),
      }),
    );

    expect(tree.processes.kind, '0 件と答えると、待っているセッションが全部終了へ倒れる').toBe(
      'unobservable',
    );
    expect(tree.projects, '数えられなくても木は返る').toHaveLength(1);
  });

  it('プロジェクトのパスは、`transcript` に書かれた作業ディレクトリを正規化してから木へ渡す', async () => {
    const stub = createStub({});

    const tree = await treeOf(stub);
    expect(
      stub.asked,
      '名前を解いてパスを得ることはしない。`transcript` に書かれた文字列から引く',
    ).toEqual(['/w/proj']);
    expect(tree.projects[0]?.canonicalPath).toBe('/real/w/proj');
    expect(tree.projects[0]?.path, '`transcript` に書かれていた表記も、手を加えずに残す').toBe(
      '/w/proj',
    );
  });

  it('正規化できなかったプロジェクトも、書かれていたパスで測れる', async () => {
    const stub = createStub({ canonical: absent('no-source') });

    const tree = await treeOf(stub);
    expect(
      tree.projects[0]?.canonicalPath,
      '正規化できなかったのは「表記の揺れを吸えなかった」だけで、「パスが分からない」ではない',
    ).toBe('/w/proj');
    expect(tree.projects[0]?.name, '名前もパスから引ける。名前で測る側へは落とさない').toBe('proj');
  });

  it('正規化できなかったプロジェクトどうしは、書かれたパスが違えば併さらない', async () => {
    const other = `${JSON.stringify({
      type: 'user',
      cwd: '/w/other',
      timestamp: '2026-08-09T11:00:00.000Z',
      message: { content: 'べつ' },
    })}\n`;
    const transcripts: TranscriptRepository = {
      async listTranscripts() {
        return observed([
          GROUP,
          {
            ...GROUP,
            slug: '-w-other',
            sessions: [{ ...GROUP.sessions[0], file: '/root/-w-other/s.jsonl' }],
          },
        ] as readonly TranscriptGroup[]);
      },
      async statTranscript() {
        return observed({ mtimeMs: NOW, sizeBytes: head.length });
      },
      async readHead(at) {
        return observed({
          text: at.file.includes('-w-other') ? other : head,
          complete: true,
        });
      },
      async readTail() {
        return observed({ text: '', complete: true });
      },
      async canonicalize() {
        return absent('no-source');
      },
    };
    const observe = observeWith(transcripts);
    const result = await observe.execute(NOW);
    if (!result.ok) throw result.error;

    expect(
      result.value.projects.map((project) => project.canonicalPath).sort(),
      '正規化できなかったことを「パスが無い」に倒すと、名前で測ることになって別の実体が併さる',
    ).toEqual(['/w/other', '/w/proj']);
  });

  it('パスを 1 つも書いていないプロジェクトには、正規化する相手が無い', async () => {
    const stub = createStub({
      groups: observed([{ ...GROUP, sessions: [], walked: observed(0) }]),
    });

    const tree = await treeOf(stub);
    expect(stub.asked, '尋ねる相手が無いのに問い合わせない').toEqual([]);
    expect(tree.projects, 'セッションを 1 つも持たない名前は、プロジェクトとして数えない').toEqual(
      [],
    );
  });

  /* `~/.claude/projects` を読むのに待ち時間は無いので、まとめて開いても速くならない。
     速くならないかわりに、読み取った範囲が全部いっぺんにメモリへ居座る — `transcript`
     ひとつで最大 12MiB、数千の `transcript` を抱えた機械では、それだけで観測が落ちる。 */
  it('読み取りは 1 つずつ行う', async () => {
    let open = 0;
    let peak = 0;
    const hold = async () => {
      open += 1;
      peak = Math.max(peak, open);
      // マイクロタスク 1 つぶん譲る。まとめて始めていれば、この間に兄弟が全部開く
      await Promise.resolve();
      open -= 1;
      return observed({ text: '', complete: true });
    };
    const child = (name: string) => ({
      id: name,
      fileName: `${name}.jsonl`,
      file: `/root/-w-proj/sess/subagents/${name}.jsonl`,
      mtimeMs: NOW,
      sizeBytes: 10,
      meta: null,
      runId: null,
    });
    const session = (id: string) => ({
      id,
      fileName: `${id}.jsonl`,
      file: `/root/-w-proj/${id}.jsonl`,
      mtimeMs: NOW,
      sizeBytes: 10,
      subagents: [
        child('agent-a-0123456789abcdef'),
        child('agent-b-0123456789abcdef'),
        child('agent-c-0123456789abcdef'),
      ],
      subagentsWalked: observed(3),
    });
    const transcripts: TranscriptRepository = {
      async listTranscripts() {
        return observed([
          { slug: '-w-a', sessions: [session('s1'), session('s2')], walked: observed(2) },
          { slug: '-w-b', sessions: [session('s3'), session('s4')], walked: observed(2) },
        ]);
      },
      async statTranscript() {
        return observed({ mtimeMs: NOW, sizeBytes: 10 });
      },
      readHead: hold,
      readTail: hold,
      async canonicalize(target) {
        return observed(target);
      },
    };
    const observe = observeWith(transcripts);

    const result = await observe.execute(NOW);
    expect(result.ok).toBe(true);
    expect(peak, '同時に開いた読み取りが 1 つを超えたら、`transcript` の数だけ積み上がる').toBe(1);
  });
});

/* 走査の作りが 1 つずつ違うテストのための組み立て。**本番と同じ順で組む** —
   索引と本読みが同じ `drafts` を分け合わないと、先頭と末尾を二度開くことになる。 */
function observeWith(transcripts: TranscriptRepository) {
  const drafts = createTranscriptDrafts({
    transcripts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
  });
  return createObserveTree({
    index: createTranscriptIndex({
      transcripts,
      processes: { list: async () => observed([]) },
      drafts,
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
      clock: { now: () => NOW },
      ttlMs: 0,
    }),
    drafts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
  });
}
