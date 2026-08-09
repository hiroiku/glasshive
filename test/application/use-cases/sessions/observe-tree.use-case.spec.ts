import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { AgentProcessIntegration } from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import type {
  TranscriptGroup,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createObserveTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* 木ひと目ぶんの組み立て。読み解きは下書きの側で確かめてあるので、
   ここで見るのは **歩けたかどうかの持ち回り** と **場所の均し方** である。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const ACTIVE_THRESHOLD_MS = 60_000;

const head = `${JSON.stringify({
  type: 'user',
  cwd: '/w/proj',
  timestamp: '2026-08-09T11:00:00.000Z',
  message: { content: 'はじめの一言' },
})}\n`;

const GROUP: TranscriptGroup = {
  slug: '-w-proj',
  sessions: [
    {
      id: 'sess',
      fileName: 'sess.jsonl',
      file: '/root/-w-proj/sess.jsonl',
      mtimeMs: NOW,
      sizeBytes: head.length,
      subagents: [],
    },
  ],
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
  return {
    asked,
    observe: createObserveTree({
      transcripts,
      processes,
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
  it('求めは必ず受理される。観測できなかったことは木の中に残る', async () => {
    const stub = createStub({
      groups: unobservable(new UnexpectedError('歩けない')),
    });

    const result = await stub.observe.execute(NOW);
    expect(result.ok, '見に行けなかったことは断る理由ではない').toBe(true);
  });

  it('置き場を歩けなかったことは、巣が 1 つも無いことと分けて持つ', async () => {
    const walked = await treeOf(createStub({}));
    const blind = await treeOf(
      createStub({ groups: unobservable(new UnexpectedError('歩けない')) }),
    );

    expect(walked.sources).toEqual({ kind: 'observed', value: 1 });
    expect(blind.projects, '歩けなかった周でも、木の形そのものは返す').toEqual([]);
    expect(blind.sources.kind, 'どちらも空の一覧になる。この欄でしか見分けられない').toBe(
      'unobservable',
    );
  });

  it('道具を数えられなかったことも、0 件と分けて持つ', async () => {
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

  it('巣の場所は、正本に書かれた作業場所を均してから木へ渡す', async () => {
    const stub = createStub({});

    const tree = await treeOf(stub);
    expect(stub.asked, '名前を解いて場所を得ることはしない。正本に書かれた字から引く').toEqual([
      '/w/proj',
    ]);
    expect(tree.projects[0]?.canonicalPath).toBe('/real/w/proj');
    expect(tree.projects[0]?.path, '正本に書かれていた字も、手を加えずに残す').toBe('/w/proj');
  });

  it('均せなかった巣も、書かれていた場所で測れる', async () => {
    const stub = createStub({ canonical: absent('no-source') });

    const tree = await treeOf(stub);
    expect(
      tree.projects[0]?.canonicalPath,
      '均せなかったのは「揺れを吸えなかった」だけで、「場所が分からない」ではない',
    ).toBe('/w/proj');
    expect(tree.projects[0]?.name, '名前も場所から引ける。名前で測る側へは落とさない').toBe('proj');
  });

  it('均せなかった巣どうしは、書かれた場所が違えば併さらない', async () => {
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
    const observe = createObserveTree({
      transcripts,
      processes: { list: async () => observed([]) },
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
    });
    const result = await observe.execute(NOW);
    if (!result.ok) throw result.error;

    expect(
      result.value.projects.map((project) => project.canonicalPath).sort(),
      '均せなかったことを「場所が無い」に倒すと、名前で測ることになって別の実体が併さる',
    ).toEqual(['/w/other', '/w/proj']);
  });

  it('場所を 1 つも書いていない巣には、均す相手が無い', async () => {
    const stub = createStub({ groups: observed([{ ...GROUP, sessions: [] }]) });

    const tree = await treeOf(stub);
    expect(stub.asked, '尋ねる相手が無いのに問い合わせない').toEqual([]);
    expect(tree.projects, 'セッションを 1 つも持たない名前は、巣として数えない').toEqual([]);
  });

  /* 置き場を読むのに待ち時間は無いので、まとめて開いても速くならない。
     速くならないかわりに、開いた窓が全部いっぺんに居座る — 正本ひとつで最大 12MiB、
     数千の正本を抱えた機械では、それだけで観測そのものが落ちる。 */
  it('窓は 1 つずつ開く', async () => {
    let open = 0;
    let peak = 0;
    const hold = async () => {
      open += 1;
      peak = Math.max(peak, open);
      // 1 順ぶん譲る。まとめて始めていれば、この間に兄弟が全部開く
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
    });
    const transcripts: TranscriptRepository = {
      async listTranscripts() {
        return observed([
          { slug: '-w-a', sessions: [session('s1'), session('s2')] },
          { slug: '-w-b', sessions: [session('s3'), session('s4')] },
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
    const observe = createObserveTree({
      transcripts,
      processes: { list: async () => observed([]) },
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
    });

    const result = await observe.execute(NOW);
    expect(result.ok).toBe(true);
    expect(peak, '同時に開いた窓が 1 つを超えたら、正本の数だけ字が積み上がる').toBe(1);
  });
});
