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

const treeOf = (found: TranscriptSession): Tree => ({
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
      sessions: [found],
      latestActivityMs: AT,
      recentTokens: observed(0),
      walked: observed(1),
    },
  ],
});

/** ファイルごとの中身を決めておく `transcript` の保存先。読めない指定は `null` で表す */
function repositoryOf(texts: Record<string, string | null>): TranscriptRepository {
  return {
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
      const text = texts[at.file];
      if (text === undefined) return absent('empty');
      if (text === null) return unobservable(new ReadFailed('読めない'));
      return observed({ text, complete: true });
    },
    async canonicalize(file: string) {
      return observed(file);
    },
  } as unknown as TranscriptRepository;
}

const run = (found: TranscriptSession, texts: Record<string, string | null>) => {
  const tree: TreeSnapshotService = {
    async get() {
      return ok(treeOf(found));
    },
  } as TreeSnapshotService;
  return createObserveMessages({ tree, transcripts: repositoryOf(texts) }).execute(
    'proj',
    found.id,
  );
};

/** 観測できたところまで取り出す。観測できていなければ、そこで組み立てが誤っている */
const seen = async (found: TranscriptSession, texts: Record<string, string | null>) => {
  const result = await run(found, texts);
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
    });

    expect(result.ok && result.value.kind).toBe('unobservable');
  });
});
