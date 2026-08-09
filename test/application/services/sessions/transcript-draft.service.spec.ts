import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type {
  AgentMeta,
  SessionSource,
  SubagentSource,
  TranscriptRepository,
  TranscriptWindow,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createTranscriptDrafts } from '~/application/services/sessions/transcript-draft.service.ts';

/* 素材に読み解きを当てるところ。置き場は開かないので、下地は頼まれた窓を返すだけの偽物でよい。

   確かめるのは二つ。**どの窓をどう頼んだか**と、**返ってきた字から何を導いたか**である。 */

const KIB = 1024;
const MIB = 1024 * KIB;
const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const ACTIVE_THRESHOLD_MS = 60_000;

/* 窓の幅。**この数は契約である。**
   ここを緩めると、読める範囲が変わって同じ正本から違う答えが出る。 */
const SESSION_HEAD = 256 * KIB;
const SESSION_TAIL = 128 * KIB;
const SUB_HEAD = 64 * KIB;
const SUB_TAIL = 64 * KIB;
const INTERVAL_SCAN = 4 * MIB;
const USAGE_SCAN = 8 * MIB;

interface Request {
  readonly file: string;
  readonly from: 'head' | 'tail';
  readonly maxBytes: number;
  readonly trimPartialLine: boolean;
}

/** 頼み 1 つに対する答え。書いていない頼みには空の窓を返す */
type Respond = (request: Request) => Observation<TranscriptWindow>;

const jsonl = (records: readonly unknown[]): string =>
  `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

const window = (text: string, complete = true): Observation<TranscriptWindow> =>
  observed({ text, complete });

const EMPTY = window('', true);

function createStub(respond: Respond) {
  const requests: Request[] = [];
  const transcripts: TranscriptRepository = {
    async listTranscripts() {
      return observed([]);
    },
    async statTranscript() {
      return observed({ mtimeMs: NOW, sizeBytes: 0 });
    },
    async readHead(at, ask) {
      const request = { file: at.file, from: 'head' as const, ...ask };
      requests.push(request);
      return respond(request);
    },
    async readTail(at, ask) {
      const request = { file: at.file, from: 'tail' as const, ...ask };
      requests.push(request);
      return respond(request);
    },
    async canonicalize(target) {
      return observed(target);
    },
  };
  return { requests, transcripts };
}

const drafts = (transcripts: TranscriptRepository) =>
  createTranscriptDrafts({
    transcripts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
  });

/** 頭も尻も同じ字を返す下地。窓の幅だけを見たいときに使う */
const answering =
  (byWindow: Partial<Record<string, Observation<TranscriptWindow>>>): Respond =>
  (request) =>
    byWindow[`${request.from}:${request.maxBytes}`] ?? EMPTY;

function sessionSource(overrides: Partial<SessionSource> = {}): SessionSource {
  return {
    id: 'sess',
    fileName: 'sess.jsonl',
    file: '/w/-w-proj/sess.jsonl',
    mtimeMs: NOW,
    sizeBytes: 120,
    subagents: [],
    ...overrides,
  };
}

const subagentSource = (
  fileName: string,
  mtimeMs = NOW,
  meta: AgentMeta | null = null,
): SubagentSource => ({
  id: fileName.replace(/\.jsonl$/, ''),
  fileName,
  file: `/w/-w-proj/sess/subagents/${fileName}`,
  mtimeMs,
  sizeBytes: 40,
  meta,
});

/** 隣に置かれた覚え書き。書かれていなかった欄は null のまま */
const agentMeta = (overrides: Partial<AgentMeta> = {}): AgentMeta => ({
  agentType: null,
  description: null,
  parentAgentId: null,
  spawnDepth: null,
  ...overrides,
});

describe('セッションの見出しを導く', () => {
  const head = jsonl([
    {
      type: 'user',
      cwd: '/w/proj',
      timestamp: '2026-08-09T11:00:00.000Z',
      gitBranch: 'main',
      message: { content: 'はじめの一言' },
    },
  ]);
  const tail = jsonl([
    {
      type: 'assistant',
      gitBranch: 'topic',
      message: {
        model: 'claude-opus-5',
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b.ts' } }],
      },
    },
  ]);

  it('頭と尻を 1 本の並びとして辿り、先に見えた欄と後に見えた欄を分けて採る', async () => {
    const stub = createStub(
      answering({
        [`head:${SESSION_HEAD}`]: window(head),
        [`tail:${SESSION_TAIL}`]: window(tail),
      }),
    );

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.title, '題は頭からしか出ない').toBe('はじめの一言');
    expect(draft.cwd).toBe('/w/proj');
    expect(draft.current, '今の様子は尻からしか出ない').toBe('Read: /a/b.ts');
    expect(draft.gitBranch, '枝は後に見えたものが現在地。尻を読まなければ main のまま').toBe(
      'topic',
    );
    expect(draft.model).toBe('claude-opus-5');
  });

  it('頭は 256KiB、尻は 128KiB。どちらも端で切れた行を繕って読む', async () => {
    const stub = createStub(() => EMPTY);

    await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(
      stub.requests.filter((request) => request.file.endsWith('sess.jsonl')),
      '幅も繕い方も、行として読み解けることを前提にしている',
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'head',
          maxBytes: SESSION_HEAD,
          trimPartialLine: true,
        }),
        expect.objectContaining({
          from: 'tail',
          maxBytes: SESSION_TAIL,
          trimPartialLine: true,
        }),
      ]),
    );
  });

  it('頭が読めなければ、尻は開かない', async () => {
    const stub = createStub((request) =>
      request.from === 'head' && request.maxBytes === SESSION_HEAD
        ? unobservable(new UnexpectedError('読めない'))
        : EMPTY,
    );

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(
      stub.requests.some((request) => request.from === 'tail' && request.maxBytes === SESSION_TAIL),
      '頭で諦めた見出しの尻を開いても、答えは変わらない',
    ).toBe(false);
    expect(draft.title, '読めなかった欄は空のまま。木そのものは返る').toBe(null);
    expect(draft.file, '見出しが読めなくても、在り処と大きさは分かっている').toBe(
      '/w/-w-proj/sess.jsonl',
    );
  });

  it('尻が読めなくても、頭で読めた分は捨てない', async () => {
    // 頭だけを読むと「本文で終わっている」ように見える正本。尻を見ないと本当の末尾は分からない
    const headEndingInText = jsonl([
      {
        type: 'user',
        cwd: '/w/proj',
        timestamp: '2026-08-09T11:00:00.000Z',
        message: { content: 'はじめの一言' },
      },
      {
        type: 'assistant',
        message: {
          model: 'claude-opus-5',
          content: [{ type: 'text', text: 'どうぞ' }],
        },
      },
    ]);
    const stub = createStub((request) =>
      request.from === 'tail' && request.maxBytes === SESSION_TAIL
        ? unobservable(new UnexpectedError('読めない'))
        : answering({ [`head:${SESSION_HEAD}`]: window(headEndingInText) })(request),
    );

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(
      draft.cwd,
      '作業場所まで消すと、その巣に道具を配れず、待っているセッションが残らず終了へ倒れる',
    ).toBe('/w/proj');
    expect(draft.title).toBe('はじめの一言');
    expect(
      draft.awaitingCandidate,
      '末尾を見ていないのに「自分の番が終わった」とは言えない。走っている最中の待ちを作らない',
    ).toBe(false);
  });

  it('課題は上限の数で切る', async () => {
    const many = jsonl([
      {
        type: 'user',
        cwd: '/w/proj/.worktrees/gh-1',
        message: {
          content: [1, 2, 3, 4, 5, 6, 7].map((n) => `.worktrees/gh-${n}`).join(' '),
        },
      },
    ]);
    const stub = createStub(answering({ [`head:${SESSION_HEAD}`]: window(many) }));

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.issues, '画面の一行に収まる数を越えたら、そこで切る').toEqual([
      'gh-1',
      'gh-2',
      'gh-3',
      'gh-4',
      'gh-5',
    ]);
  });
});

describe('子の見出しを導く', () => {
  const childHead = jsonl([
    {
      type: 'user',
      cwd: '/w/proj/.worktrees/gh-12',
      timestamp: '2026-08-09T11:30:00.000Z',
      gitBranch: 'topic',
      message: { content: 'やって' },
    },
    {
      type: 'assistant',
      effort: 'low',
      message: {
        model: 'claude-haiku-4',
        content: [{ type: 'text', text: 'はい' }],
      },
    },
  ]);
  const childTail = jsonl([
    {
      type: 'assistant',
      message: {
        model: 'claude-haiku-4',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }],
      },
    },
  ]);

  const withChild = (fileName: string, mtimeMs = NOW) =>
    sessionSource({ subagents: [subagentSource(fileName, mtimeMs)] });

  it('止まっている子の尻は開かない', async () => {
    const stub = createStub(answering({ [`head:${SUB_HEAD}`]: window(childHead) }));
    // 稼働の窓より前にしか書かれていない子は、止まっている
    const source = withChild('agent-x-0123456789abcdef.jsonl', NOW - 10 * 60_000);

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    const child = draft.subagents[0];
    expect(child?.model, 'モデルは委譲のときに決まる。頭だけで足りる').toBe('claude-haiku-4');
    expect(child?.effort).toBe('low');
    expect(
      stub.requests.some((request) => request.from === 'tail' && request.maxBytes === SUB_TAIL),
      '止まっている子の値は委譲のときに決まっている。末尾を開く理由が無い',
    ).toBe(false);
    expect(child?.current, '今の様子は末尾からしか出ないので、無いままになる').toBe(null);
  });

  it('動いている子は、末尾まで読んで今の様子を採る', async () => {
    const stub = createStub(
      answering({
        [`head:${SUB_HEAD}`]: window(childHead),
        [`tail:${SUB_TAIL}`]: window(childTail),
      }),
    );

    const draft = await drafts(stub.transcripts).readSession(
      withChild('agent-x-0123456789abcdef.jsonl'),
      NOW,
    );
    expect(draft.subagents[0]?.current).toBe('Bash: npm test');
    expect(draft.subagents[0]?.cwd, '作業場所は先頭の一行から。尻を読んでも変わらない').toBe(
      '/w/proj/.worktrees/gh-12',
    );
  });

  it('子の尻が読めなくても、頭で読めた分は捨てない', async () => {
    const stub = createStub((request) =>
      request.from === 'tail' && request.maxBytes === SUB_TAIL
        ? unobservable(new UnexpectedError('読めない'))
        : answering({ [`head:${SUB_HEAD}`]: window(childHead) })(request),
    );

    const draft = await drafts(stub.transcripts).readSession(
      withChild('agent-x-0123456789abcdef.jsonl'),
      NOW,
    );
    expect(draft.subagents[0]?.model, '委譲のときに決まった値は頭に在る。尻ごと捨てない').toBe(
      'claude-haiku-4',
    );
    expect(draft.subagents[0]?.cwd).toBe('/w/proj/.worktrees/gh-12');
    expect(draft.subagents[0]?.current, '尻を読めていないので、今の様子だけは分からない').toBe(
      null,
    );
  });

  it('子の頭は 64KiB。行の切れ目は繕わない', async () => {
    const stub = createStub(() => EMPTY);

    await drafts(stub.transcripts).readSession(withChild('agent-x-0123456789abcdef.jsonl'), NOW);
    expect(
      stub.requests.find(
        (request) => request.from === 'head' && request.file.includes('subagents'),
      ),
      '切れた行は読み解けずに落ちるだけで、要るものは先頭に揃う',
    ).toEqual(expect.objectContaining({ maxBytes: SUB_HEAD, trimPartialLine: false }));
  });

  it('取り組んでいる課題は、本文ではなく作業場所の字から引く', async () => {
    const stub = createStub(answering({ [`head:${SUB_HEAD}`]: window(childHead) }));

    const draft = await drafts(stub.transcripts).readSession(
      withChild('agent-x-0123456789abcdef.jsonl'),
      NOW,
    );
    expect(draft.subagents[0]?.issue).toBe('gh-12');
  });

  it('鍵は名前から拡張子を落としたもの、呼び名は前置きと指紋を剥がしたもの', async () => {
    const stub = createStub(() => EMPTY);

    const draft = await drafts(stub.transcripts).readSession(
      withChild('agent-review-0123456789abcdef.jsonl'),
      NOW,
    );
    expect(draft.subagents[0]?.id, '剥がしたものを鍵に使うと、指紋だけが違う子が同じに見える').toBe(
      'agent-review-0123456789abcdef',
    );
    expect(draft.subagents[0]?.label).toBe('review');
  });

  it('子の棚に混じった、子でない正本は数えない', async () => {
    const stub = createStub(() => EMPTY);
    const source = sessionSource({
      subagents: [subagentSource('agent-x-0123456789abcdef.jsonl'), subagentSource('notes.jsonl')],
    });

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(
      draft.subagents.map((child) => child.id),
      '名前で見分けるのは言葉を持つ側の仕事。口はただ棚に在ったものを並べてくる',
    ).toEqual(['agent-x-0123456789abcdef']);
  });
});

describe('子を呼んだ相手の下へ入れ直す', () => {
  const withChildren = (...subagents: readonly SubagentSource[]) => sessionSource({ subagents });

  const parent = (label: string) =>
    subagentSource(`agent-${label}-0123456789abcdef.jsonl`, NOW, agentMeta());

  const child = (label: string, parentAgentId: string) =>
    subagentSource(`agent-${label}-0123456789abcdef.jsonl`, NOW, agentMeta({ parentAgentId }));

  it('親を持つ子は親のすぐ下に来て、段が 2 になる', async () => {
    const stub = createStub(() => EMPTY);
    const source = withChildren(
      parent('lead'),
      subagentSource('agent-other-0123456789abcdef.jsonl', NOW, agentMeta()),
      child('helper', 'agent-lead-0123456789abcdef'),
    );

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(
      draft.subagents.map((sub) => [sub.id, sub.depth]),
      '段は子どうしで数える。セッションが直に呼んだ子が 1、その子が 2',
    ).toEqual([
      ['agent-lead-0123456789abcdef', 1],
      ['agent-helper-0123456789abcdef', 2],
      ['agent-other-0123456789abcdef', 1],
    ]);
  });

  it('覚え書きの指す字に前置きが無くても、棚に在る鍵へ合わせる', async () => {
    const stub = createStub(() => EMPTY);
    // 覚え書きは呼んだ相手を `agent-` を落とした字で書く
    const source = withChildren(parent('lead'), child('helper', 'lead-0123456789abcdef'));

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(
      draft.subagents.map((sub) => [sub.id, sub.parentId, sub.depth]),
      '字のまま突き合わせると親が一人も見つからず、木は 2 段に潰れたままになる',
    ).toEqual([
      ['agent-lead-0123456789abcdef', null, 1],
      ['agent-helper-0123456789abcdef', 'agent-lead-0123456789abcdef', 2],
    ]);
  });

  it('親が棚に居ない子は、段 1 に出て消えない', async () => {
    const stub = createStub(() => EMPTY);
    const source = withChildren(child('orphan', 'agent-gone-0123456789abcdef'));

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(
      draft.subagents.map((sub) => [sub.id, sub.depth]),
      '木から外すと、観る人には「そんな子は動いていない」としか見えない',
    ).toEqual([['agent-orphan-0123456789abcdef', 1]]);
    expect(draft.subagents[0]?.parentId, '当てが外れた字は、観測した字のまま残す').toBe(
      'agent-gone-0123456789abcdef',
    );
  });

  it('覚え書きが読めなかった子も、段 1 に並ぶ', async () => {
    const stub = createStub(() => EMPTY);
    const source = withChildren(subagentSource('agent-x-0123456789abcdef.jsonl', NOW, null));

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(draft.subagents.map((sub) => [sub.id, sub.parentId, sub.depth])).toEqual([
      ['agent-x-0123456789abcdef', null, 1],
    ]);
  });

  it('兄弟どうしの並びは、棚に在った順のまま', async () => {
    const stub = createStub(() => EMPTY);
    const source = withChildren(parent('b'), parent('a'), child('c', 'agent-b-0123456789abcdef'));

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(
      draft.subagents.map((sub) => sub.id),
      '何を先に見せるかを決めるのは呼ぶ側の役目で、形を決めるのが domain の役目である',
    ).toEqual(['agent-b-0123456789abcdef', 'agent-c-0123456789abcdef', 'agent-a-0123456789abcdef']);
  });

  it('呼ばれ方は覚え書きから採る', async () => {
    const stub = createStub(() => EMPTY);
    const source = withChildren(
      subagentSource(
        'agent-x-0123456789abcdef.jsonl',
        NOW,
        agentMeta({ agentType: 'general-purpose' }),
      ),
      subagentSource('agent-y-0123456789abcdef.jsonl', NOW, null),
    );

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(draft.subagents.map((sub) => sub.agentType)).toEqual(['general-purpose', null]);
  });
});

describe('子の呼び名を決める', () => {
  const withMeta = (meta: AgentMeta | null) =>
    sessionSource({
      subagents: [subagentSource('agent-review-0123456789abcdef.jsonl', NOW, meta)],
    });

  it('呼んだ側が添えた一行が在れば、それが呼び名になる', async () => {
    const stub = createStub(() => EMPTY);

    const draft = await drafts(stub.transcripts).readSession(
      withMeta(agentMeta({ description: 'Audit the transcript reader' })),
      NOW,
    );
    expect(
      draft.subagents[0]?.label,
      '名前から起こした呼び名は役どころを語らない。添えられた一行だけが語る',
    ).toBe('Audit the transcript reader');
  });

  it('一行が無ければ、名前から起こした呼び名に倒す', async () => {
    const stub = createStub(() => EMPTY);

    const draft = await drafts(stub.transcripts).readSession(withMeta(agentMeta()), NOW);
    expect(draft.subagents[0]?.label).toBe('review');
  });

  it('名前からも呼び名が起きなければ、鍵をそのまま呼び名にする', async () => {
    const stub = createStub(() => EMPTY);
    // 前置きしか無い名前。剥がすと何も残らない
    const source = sessionSource({ subagents: [subagentSource('agent-.jsonl')] });

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(draft.subagents[0]?.label, '名無しで並ぶより、鍵で並ぶほうがまだ手繰れる').toBe(
      'agent-',
    );
  });

  it('覚え書きそのものが無くても、名前から起こした呼び名は残る', async () => {
    const stub = createStub(() => EMPTY);

    const draft = await drafts(stub.transcripts).readSession(withMeta(null), NOW);
    expect(draft.subagents[0]?.label).toBe('review');
    expect(draft.subagents[0]?.id, '同一性は呼び名に左右されない').toBe(
      'agent-review-0123456789abcdef',
    );
  });

  it('空白しか無い一行は、書かれていなかったものに倒す', async () => {
    const stub = createStub(() => EMPTY);

    const draft = await drafts(stub.transcripts).readSession(
      withMeta(agentMeta({ description: '  \n ' })),
      NOW,
    );
    expect(draft.subagents[0]?.label).toBe('review');
  });

  it('改行を挟んだ一行は、1 行に潰してから丸める', async () => {
    const stub = createStub(() => EMPTY);

    const draft = await drafts(stub.transcripts).readSession(
      withMeta(agentMeta({ description: 'Read the shelf\nthen fix the tree' })),
      NOW,
    );
    expect(
      draft.subagents[0]?.label,
      '潰さずに渡すと、木の 1 行の中で改行が空白として散らばり、隣の欄まで押し出す',
    ).toBe('Read the shelf then fix the tree');
  });

  it('長い一行は、題と同じ 60 字で丸める', async () => {
    const stub = createStub(() => EMPTY);
    const long = 'a'.repeat(61);

    const draft = await drafts(stub.transcripts).readSession(
      withMeta(agentMeta({ description: long })),
      NOW,
    );
    expect(draft.subagents[0]?.label).toBe(`${'a'.repeat(60)}…`);
  });
});

describe('動いていた帯を導く', () => {
  const activity = jsonl([
    { type: 'user', timestamp: '2026-08-09T10:00:00.000Z' },
    { type: 'assistant', timestamp: '2026-08-09T10:01:00.000Z' },
    { type: 'user', timestamp: '2026-08-09T11:00:00.000Z' },
  ]);

  it('末尾の時刻を繋いで帯にする', async () => {
    const stub = createStub(answering({ [`tail:${INTERVAL_SCAN}`]: window(activity) }));

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.activity, '2 分より長い無音で帯を分ける').toEqual({
      kind: 'observed',
      value: {
        complete: true,
        intervals: [
          {
            fromMs: Date.parse('2026-08-09T10:00:00.000Z'),
            toMs: Date.parse('2026-08-09T10:01:00.000Z'),
          },
          {
            fromMs: Date.parse('2026-08-09T11:00:00.000Z'),
            toMs: Date.parse('2026-08-09T11:00:00.000Z'),
          },
        ],
      },
    });
  });

  it('帯は末尾 4MiB から拾う。時刻は字面で探すので、切れた行は繕わない', async () => {
    const stub = createStub(() => EMPTY);

    await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(
      stub.requests.find(
        (request) => request.from === 'tail' && request.maxBytes === INTERVAL_SCAN,
      ),
    ).toEqual(expect.objectContaining({ trimPartialLine: false }));
  });

  it('先頭まで届かなかったことは、そのまま持ち帰る', async () => {
    const stub = createStub(answering({ [`tail:${INTERVAL_SCAN}`]: window(activity, false) }));

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(
      draft.activity.kind === 'observed' && draft.activity.value.complete,
      'これより前にも帯が在り得ることを、値として持ち帰る',
    ).toBe(false);
  });

  it('読めなかった帯を、空の帯に均さない', async () => {
    const stub = createStub((request) =>
      request.maxBytes === INTERVAL_SCAN ? unobservable(new UnexpectedError('読めない')) : EMPTY,
    );

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(
      draft.activity.kind,
      '空の帯に均すと、開けなかった正本が「ずっと静かだった」ものとして並ぶ',
    ).toBe('unobservable');
  });
});

describe('使ったトークンを数える', () => {
  const usage = jsonl([
    {
      type: 'assistant',
      timestamp: '2026-08-09T11:02:00.000Z',
      requestId: 'req-1',
      message: {
        model: 'claude-opus-5',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 40,
        },
      },
    },
  ]);

  it('窓の内なら、末尾 8MiB から拾って総量に畳む', async () => {
    const stub = createStub(answering({ [`tail:${USAGE_SCAN}`]: window(usage) }));

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.tokens, 'cacheRead は前に書いた分の読み直しなので、使った量には足さない').toEqual({
      kind: 'observed',
      value: 70,
    });
    expect(stub.requests.find((request) => request.maxBytes === USAGE_SCAN)).toEqual(
      expect.objectContaining({ from: 'tail', trimPartialLine: false }),
    );
  });

  it('窓より古い正本には、触りもしない', async () => {
    const stub = createStub(answering({ [`tail:${USAGE_SCAN}`]: window(usage) }));
    const stale = sessionSource({ mtimeMs: NOW - 8 * DAY_MS });

    const draft = await drafts(stub.transcripts).readSession(stale, NOW);
    expect(draft.tokens, '読んでいないのであって、消費が無かったのではない').toEqual({
      kind: 'absent',
      reason: 'out-of-window',
    });
    expect(
      stub.requests.some((request) => request.maxBytes === USAGE_SCAN),
      '窓の外と決まったなら、開く理由が無い',
    ).toBe(false);
  });

  it('窓の幅ちょうどは外側', async () => {
    const stub = createStub(answering({ [`tail:${USAGE_SCAN}`]: window(usage) }));
    const boundary = sessionSource({ mtimeMs: NOW - 7 * DAY_MS });
    const inside = sessionSource({ mtimeMs: NOW - 7 * DAY_MS + 1 });

    expect(
      (await drafts(stub.transcripts).readSession(boundary, NOW)).tokens,
      '稼働の判定は「以下」で内、数えの窓は「未満」で内。向きが違う',
    ).toEqual({ kind: 'absent', reason: 'out-of-window' });
    expect((await drafts(stub.transcripts).readSession(inside, NOW)).tokens.kind).toBe('observed');
  });

  it('直近 24 時間ぶんも、同じ一度の歩きで数える', async () => {
    const spread = jsonl([
      {
        type: 'assistant',
        timestamp: new Date(NOW - 2 * DAY_MS).toISOString(),
        requestId: 'old',
        message: {
          model: 'claude-opus-5',
          usage: { input_tokens: 100, output_tokens: 0 },
        },
      },
      {
        type: 'assistant',
        timestamp: new Date(NOW - 3600_000).toISOString(),
        requestId: 'new',
        message: {
          model: 'claude-opus-5',
          usage: { input_tokens: 7, output_tokens: 0 },
        },
      },
    ]);
    const stub = createStub(answering({ [`tail:${USAGE_SCAN}`]: window(spread) }));

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.tokens).toEqual({ kind: 'observed', value: 107 });
    expect(
      draft.recentTokens,
      '一覧の列はこれを見る。巣ごとに問い直すと、一覧が正本の数だけ問い合わせることになる',
    ).toEqual({ kind: 'observed', value: 7 });
    expect(
      stub.requests.filter((request) => request.maxBytes === USAGE_SCAN),
      '総量と直近で、同じ正本を二度開かない',
    ).toHaveLength(1);
  });

  it('読めなかった数えを、0 に均さない', async () => {
    const stub = createStub((request) =>
      request.maxBytes === USAGE_SCAN ? unobservable(new UnexpectedError('読めない')) : EMPTY,
    );

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.tokens.kind, '0 と答えると「使っていない」と読まれる').toBe('unobservable');
  });
});

describe('セッションの立ち位置', () => {
  it('並びと稼働の判定は、自分と子のうち最も新しい書き込みで決まる', async () => {
    const stub = createStub(() => EMPTY);
    const source = sessionSource({
      mtimeMs: NOW - 10 * 60_000,
      subagents: [subagentSource('agent-x-0123456789abcdef.jsonl', NOW - 1000)],
    });

    const draft = await drafts(stub.transcripts).readSession(source, NOW);
    expect(draft.lastActivityMs).toBe(NOW - 1000);
    expect(
      draft.ownMtimeMs,
      '自分だけの書き込みも別に持つ。子待ちの判定は両者を分けないと付けられない',
    ).toBe(NOW - 10 * 60_000);
  });

  it('無い正本も、在り処と大きさだけの下書きとして並ぶ', async () => {
    const stub = createStub(() => absent('no-source'));

    const draft = await drafts(stub.transcripts).readSession(sessionSource(), NOW);
    expect(draft.id).toBe('sess');
    expect(draft.sizeBytes).toBe(120);
    expect(draft.awaitingCandidate, '末尾の形が読めないなら、人の番だとは言えない').toBe(false);
  });
});
