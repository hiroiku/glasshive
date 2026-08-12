import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import type { TranscriptRepository } from '~/application/ports/repositories/sessions/transcript.repository.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import { createObserveMessages } from '~/application/use-cases/sessions/observe-messages.use-case.ts';

/* 材料の形は、渡す相手の側から引く。**書き写して持たない** —— 木の欄が増えたときに、
   ここだけが古い形のまま通り続ける。この層は domain を直に `import` できない。 */
type Tree = Extract<Awaited<ReturnType<TreeSnapshotService['get']>>, { ok: true }>['value'];
type TranscriptSession = Tree['projects'][number]['sessions'][number];
type SubagentSession = TranscriptSession['subagents'][number];

/* セッション 1 つぶんのメッセージのやり取り。

   ここで決まるのは、**当たらなかった宛先をどう数えるか**である。この画面のエージェントに
   当たらなかったメッセージは 2 通りある —— 別のセッションへ届いたものと、届いたかどうかも
   分からないものである。同じ「置けなかった」に数えると、隣のセッションと一日中やり取り
   していたことが、読み取り範囲の外へ落ちた数として消える。 */

class ReadFailed extends AppError {
  readonly code = 'transcript.read_failed';
}

const AT = Date.parse('2026-08-09T12:00:00.000Z');

const send = (to: string, toolUseId: string, agentId: string | null = null) =>
  JSON.stringify({
    ...(agentId === null ? {} : { agentId }),
    timestamp: new Date(AT).toISOString(),
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'SendMessage',
          input: { to, summary: 'よろしく', message: '本文' },
        },
      ],
    },
  });

const sendResult = (toolUseId: string, msgId: string) =>
  JSON.stringify({
    type: 'user',
    timestamp: new Date(AT + 200).toISOString(),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId }] },
    toolUseResult: { success: true, msg_id: msgId },
  });

const arrived = (msgId: string, name = 'glasshive-clean-arch-port') =>
  JSON.stringify({
    type: 'attachment',
    timestamp: new Date(AT + 1000).toISOString(),
    attachment: {
      type: 'queued_command',
      prompt: '本文',
      origin: {
        kind: 'peer',
        from: 'uds:/tmp/cc-socks/77370.sock',
        name,
        fromMode: 'prompting',
        msg_id: msgId,
        body: '本文',
      },
    },
  });

const subagent = (over: Partial<SubagentSession> = {}): SubagentSession => ({
  id: 'agent-a1',
  label: 'a1',
  agentType: null,
  name: 'impl-t10',
  toolUseId: null,
  parentId: null,
  depth: 1,
  file: '/nest/a1.jsonl',
  state: 'ended',
  startedRaw: null,
  lastActivityMs: AT,
  tokens: observed(0),
  model: null,
  effort: null,
  gitBranch: null,
  cwd: null,
  issue: null,
  current: null,
  activity: observed({ intervals: [], complete: true }),
  ...over,
});

const session = (over: Partial<TranscriptSession> = {}): TranscriptSession => ({
  id: 'sess-1',
  file: '/nest/sess-1.jsonl',
  state: 'active',
  awaiting: null,
  title: null,
  startedRaw: null,
  lastActivityMs: AT,
  ownMtimeMs: AT,
  tokens: observed(0),
  model: null,
  effort: null,
  gitBranch: null,
  cwd: null,
  issues: [],
  current: null,
  activity: observed({ intervals: [], complete: true }),
  sizeBytes: 0,
  subagents: [],
  subagentsWalked: observed(0),
  ...over,
});

const treeOf = (sessions: readonly TranscriptSession[]): Tree => ({
  generatedAtMs: AT,
  activeThresholdMs: 300_000,
  sources: observed(1),
  processes: observed(0),
  projects: [
    {
      id: 'proj',
      slugs: ['proj'],
      path: '/w/proj',
      canonicalPath: '/w/proj',
      name: 'proj',
      liveProcessCount: 0,
      sessions: [...sessions],
      latestActivityMs: AT,
      recentTokens: observed(0),
      walked: observed(1),
    },
  ],
});

/** 1 本ぶんの中身。読めないなら `null`、先頭まで届かなかったなら `partial` を立てる */
type Held = string | null | { readonly text: string; readonly partial: true };

/** ファイルごとの中身を決めておく `transcript` の保存先。開いた先も控える */
function repositoryOf(texts: Record<string, Held>) {
  const opened: string[] = [];
  const repository = {
    async listTranscripts() {
      return absent('empty');
    },
    async statTranscript() {
      return observed({ mtimeMs: AT, sizeBytes: 1024 });
    },
    async readHead() {
      return absent('empty');
    },
    async readTail(at: { readonly file: string }) {
      opened.push(at.file);
      const held = texts[at.file];
      if (held === undefined) return absent('empty');
      if (held === null) return unobservable(new ReadFailed('読めない'));
      if (typeof held === 'string') return observed({ text: held, complete: true });
      return observed({ text: held.text, complete: false });
    },
    async canonicalize(file: string) {
      return observed(file);
    },
  } as unknown as TranscriptRepository;
  return { repository, opened };
}

const run = (
  found: TranscriptSession,
  texts: Record<string, Held>,
  others: readonly TranscriptSession[] = [],
) => {
  const tree: TreeSnapshotService = {
    async get() {
      return ok(treeOf([found, ...others]));
    },
  } as TreeSnapshotService;
  const { repository, opened } = repositoryOf(texts);
  return {
    opened,
    answer: createObserveMessages({ tree, transcripts: repository }).execute('proj', found.id),
  };
};

/** 観測できたところまで取り出す。観測できていなければ、そこで組み立てが誤っている */
const seen = async (
  found: TranscriptSession,
  texts: Record<string, Held>,
  others: readonly TranscriptSession[] = [],
) => {
  const result = await run(found, texts, others).answer;
  if (!result.ok || result.value.kind !== 'observed') throw new Error('観測できていない');
  return result.value.value;
};

describe('この画面のエージェントどうしのやり取り', () => {
  it('宛先が当たれば、送り手と受け手を木の中の同一性で結ぶ', async () => {
    const messages = await seen(session({ subagents: [subagent()] }), {
      '/nest/sess-1.jsonl': send('impl-t10', 'toolu_01A'),
      '/nest/a1.jsonl': '',
    });

    expect(messages.hops).toHaveLength(1);
    expect(messages.hops[0]?.fromId).toBe('sess-1');
    expect(messages.hops[0]?.toId).toBe('agent-a1');
    expect(messages.peers, 'この画面の中の相手は、居ない相手として数えない').toEqual([]);
  });
});

/* 別のセッションへ渡ったメッセージは、宛先がこの画面のどのエージェントにも当たらない。
 **届かなかったのではなく、届いた先が別のセッションなのである。** */
describe('この画面に居ないセッションとのやり取り', () => {
  it('鍵が在れば、届いたものとして相手の自己申告した名前ごと持つ', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': [
        send('glasshive-clean-arch-port', 'toolu_01A'),
        sendResult('toolu_01A', 'be3ecd13'),
      ].join('\n'),
    });

    expect(messages.unplaced, '届いたものを置けなかった数に混ぜない').toBe(0);
    expect(messages.peers).toEqual([
      {
        atMs: AT,
        direction: 'sent',
        agentId: 'sess-1',
        peer: 'glasshive-clean-arch-port',
        msgId: 'be3ecd13',
        summary: 'よろしく',
        mode: null,
      },
    ]);
  });

  /* 結果が読み取り範囲の外に落ちると、届いたかどうかが分からない。
     届いたことにも、届かなかったことにもしない。 */
  it('鍵が無ければ、置けなかった数として数える', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': send('どこかの誰か', 'toolu_01A'),
    });

    expect(messages.unplaced).toBe(1);
    expect(messages.peers).toEqual([]);
  });

  it('届いたメッセージは、自己申告した名前と届き方ごと持つ', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': arrived('be3ecd13'),
    });

    expect(messages.peers).toEqual([
      {
        atMs: AT + 1000,
        direction: 'received',
        agentId: 'sess-1',
        peer: 'glasshive-clean-arch-port',
        msgId: 'be3ecd13',
        summary: '',
        mode: 'prompting',
      },
    ]);
  });

  /* ソケットのパスはプロセスを指すもので、プロセスが終われば使い回される。
     自己申告した名前の代わりに置くと、別のセッションを同じ相手として読ませることになる。 */
  it('自己申告した名前が無ければ、宛先の綴りで代えない', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': arrived('be3ecd13').replace('"name":"glasshive-clean-arch-port",', ''),
    });

    expect(messages.peers[0]?.peer).toBe('');
  });

  /* ソケットはプロセスを指すもので、プロセスが終われば使い回される。
     パスをそのまま相手として出すと、別のセッションを同じ相手として読ませることになる。 */
  it('ソケットで名指した宛先を、相手の名前として持たない', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': [
        send('uds:/tmp/cc-socks/25007.sock', 'toolu_01A'),
        sendResult('toolu_01A', 'be3ecd13'),
      ].join('\n'),
    });

    expect(messages.peers[0]?.peer, 'プロセスのパスは相手の同一性ではない').toBe('');
    expect(messages.peers[0]?.msgId, '結べる鍵は残す').toBe('be3ecd13');
  });

  it('ref の付いた名前は、書かれたまま持つ', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': [
        send('glasshive-6d [066b70]', 'toolu_01A'),
        sendResult('toolu_01A', 'be3ecd13'),
      ].join('\n'),
    });

    expect(messages.peers[0]?.peer).toBe('glasshive-6d [066b70]');
  });

  it('時刻の順に並ぶ', async () => {
    const messages = await seen(session(), {
      '/nest/sess-1.jsonl': [
        arrived('m2'),
        send('peer', 'toolu_01A'),
        sendResult('toolu_01A', 'm1'),
      ].join('\n'),
    });

    expect(messages.peers.map((exchange) => exchange.msgId)).toEqual(['m1', 'm2']);
  });

  /* 1 本でも開けなければ、やり取りそのものを観測できなかったことにする。
     開けた分だけを出すと、抜けた線が「無かったやりとり」に見える。 */
  it('`transcript` を 1 本でも開けなければ、観測できなかったと言う', async () => {
    const result = await run(session({ subagents: [subagent()] }), {
      '/nest/sess-1.jsonl': arrived('be3ecd13'),
      '/nest/a1.jsonl': null,
    }).answer;

    expect(result.ok && result.value.kind).toBe('unobservable');
  });
});

/* 名乗る名前はどの id とも一致しないが、`msg_id` は両端の `transcript` に同じ文字列で
   書かれている。**そこを名前で結ぶと、観測していない対応を作ることになる。** */
describe('片端しか置けなかった相手を、同じプロジェクトの中に探す', () => {
  const other = (over: Partial<TranscriptSession> = {}) =>
    session({ id: 'sess-2', file: '/nest/sess-2.jsonl', lastActivityMs: AT + 60_000, ...over });

  it('送った先が同じプロジェクトのセッションなら、片端ではなく矢にする', async () => {
    const messages = await seen(
      session(),
      {
        '/nest/sess-1.jsonl': [
          send('glasshive-clean-arch-port', 'toolu_01A'),
          sendResult('toolu_01A', 'be3ecd13'),
        ].join('\n'),
        '/nest/sess-2.jsonl': arrived('be3ecd13'),
      },
      [other()],
    );

    expect(messages.peers, '両端を観測できているのに、片端のままにしている').toEqual([]);
    expect(messages.hops).toHaveLength(1);
    expect(messages.hops[0]?.fromId).toBe('sess-1');
    expect(messages.hops[0]?.toId).toBe('sess-2');
    expect(messages.hops[0]?.hop.summary, '矢は送った側の 1 行から作る').toBe('よろしく');
    expect(messages.peersComplete).toBe(true);
  });

  it('届いたメッセージの送り主も、同じプロジェクトの中に探す', async () => {
    const messages = await seen(
      session(),
      {
        '/nest/sess-1.jsonl': arrived('be3ecd13'),
        '/nest/sess-2.jsonl': [
          send('glasshive-clean-arch-port', 'toolu_01A'),
          sendResult('toolu_01A', 'be3ecd13'),
        ].join('\n'),
      },
      [other()],
    );

    expect(messages.peers).toEqual([]);
    expect(messages.hops).toHaveLength(1);
    expect(messages.hops[0]?.fromId, '送ったのは向こうである').toBe('sess-2');
    expect(messages.hops[0]?.toId).toBe('sess-1');
  });

  /* 2 つのセッションが互いに送り合う。**どちらの向きも、送った側の行から作る** ——
     届いた側の記録は宛先を持たないので、そこから作ると誰へ送ったのかが消える。 */
  it('送り合っていれば、両方の向きの矢になる', async () => {
    const messages = await seen(
      session(),
      {
        '/nest/sess-1.jsonl': [
          send('glasshive-clean-arch-port', 'toolu_01A'),
          sendResult('toolu_01A', 'out-1'),
          arrived('in-1'),
        ].join('\n'),
        '/nest/sess-2.jsonl': [
          arrived('out-1'),
          send('wave-1', 'toolu_01B'),
          sendResult('toolu_01B', 'in-1'),
        ].join('\n'),
      },
      [other()],
    );

    expect(messages.peers).toEqual([]);
    expect(
      messages.hops.map((placed) => `${placed.fromId}→${placed.toId}`),
      '一方の向きだけが残ると、やり取りが片側の独り言になる',
    ).toEqual(['sess-1→sess-2', 'sess-2→sess-1']);
  });

  /* 同じ 1 通が 2 つのセッションへ届くことは在る。**届いた者どうしを矢で結ばない** ——
     どちらも受け取った側で、送り手はここに居ない。矢は送った側の 1 行からしか作れない。 */
  it('同じ 1 通を受け取っただけのセッションとは、結ばない', async () => {
    const messages = await seen(
      session(),
      {
        '/nest/sess-1.jsonl': arrived('be3ecd13'),
        '/nest/sess-2.jsonl': arrived('be3ecd13'),
      },
      [other()],
    );

    expect(messages.hops, '受け取った者どうしを、送った・届いたの関係にしている').toEqual([]);
    expect(messages.peers, '送り手を置けていないので、片端のまま残る').toHaveLength(1);
  });

  /* 始まりより前にも、最後の書き込みより後にも、その 1 行は書かれようがない。
     **開かずに済むものを開かない** —— 1 通ぶんの相手を探すために、プロジェクトぜんぶを
     開くわけにはいかない。 */
  it('その時刻に動いていなかったセッションは、開きに行かない', async () => {
    const { opened, answer } = run(
      session(),
      {
        '/nest/sess-1.jsonl': [
          send('glasshive-clean-arch-port', 'toolu_01A'),
          sendResult('toolu_01A', 'be3ecd13'),
        ].join('\n'),
        '/nest/sess-2.jsonl': arrived('be3ecd13'),
      },
      [other({ lastActivityMs: AT - 60_000 })],
    );
    await answer;

    expect(opened, '持ち得ない `transcript` まで開いている').toEqual(['/nest/sess-1.jsonl']);
  });

  it('やり取りより後に始まったセッションも、開きに行かない', async () => {
    const { opened, answer } = run(
      session(),
      {
        '/nest/sess-1.jsonl': [
          send('glasshive-clean-arch-port', 'toolu_01A'),
          sendResult('toolu_01A', 'be3ecd13'),
        ].join('\n'),
        '/nest/sess-2.jsonl': arrived('be3ecd13'),
      },
      [other({ startedRaw: new Date(AT + 60_000).toISOString() })],
    );
    await answer;

    expect(opened, 'まだ始まっていないセッションに、その 1 行は書かれようがない').toEqual([
      '/nest/sess-1.jsonl',
    ]);
  });

  /* 開かなかった先に相手が居たかどうかは言えない。**「探した先には居なかった」と
     「相手が居なかった」を同じにしない。** */
  it('上限まで開いても見つからなければ、探し切れていないと言う', async () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      other({ id: `sess-${index + 2}`, file: `/nest/sess-${index + 2}.jsonl` }),
    );
    const texts: Record<string, Held> = {
      '/nest/sess-1.jsonl': [
        send('glasshive-clean-arch-port', 'toolu_01A'),
        sendResult('toolu_01A', 'be3ecd13'),
      ].join('\n'),
    };
    for (const candidate of many) texts[candidate.file] = '';

    const messages = await seen(session(), texts, many);

    expect(messages.peers, '見つからなかったものは片端のまま残す').toHaveLength(1);
    expect(messages.peersComplete, '開かなかった先に居た相手が、居なかったことになる').toBe(false);
  });

  it('読み取り範囲が先頭まで届かなかった先が在れば、探し切れていないと言う', async () => {
    const messages = await seen(
      session(),
      {
        '/nest/sess-1.jsonl': [
          send('glasshive-clean-arch-port', 'toolu_01A'),
          sendResult('toolu_01A', 'be3ecd13'),
        ].join('\n'),
        '/nest/sess-2.jsonl': { text: '', partial: true },
      },
      [other()],
    );

    expect(messages.peers).toHaveLength(1);
    expect(messages.peersComplete, '読めていない先に在ったかどうかは言えない').toBe(false);
  });

  /* 探す相手が居ないなら、探し切れたかを問う相手も居ない */
  it('片端しか置けなかったやり取りが無ければ、探し切れたと言う', async () => {
    const messages = await seen(session(), { '/nest/sess-1.jsonl': '' }, [other()]);

    expect(messages.peers).toEqual([]);
    expect(messages.peersComplete).toBe(true);
  });
});
