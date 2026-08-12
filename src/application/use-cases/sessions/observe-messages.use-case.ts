import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import {
  ProjectNotObservedError,
  SessionNotObservedError,
} from '~/application/errors/sessions/not-observed.error.ts';
import type { TranscriptRepository } from '~/application/ports/repositories/sessions/transcript.repository.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { TranscriptSession } from '~/domain/entities/sessions/session.entity.ts';
import {
  extractDeliveries,
  extractHops,
  peerNameOf,
  placeHop,
  senderOf,
} from '~/domain/services/sessions/agent-message.service.ts';
import {
  type AgentHop,
  SESSION_ADDRESSES,
} from '~/domain/value-objects/sessions/agent-message.value-object.ts';
import {
  MESSAGE_PEER_SESSIONS,
  MESSAGE_SCAN_BYTES,
} from '~/domain/value-objects/sessions/observation-window.value-object.ts';

/* セッション 1 つぶんのメッセージのやり取りを集める。

   範囲はセッション 1 つ。メッセージは `transcript` のどこにでも現れるので、拾うには
   丸ごと開くしかない。プロジェクトぜんぶを開くと数百 MiB になるので、ユーザーが開いた
   1 つに絞る。

   **読み取り範囲が先頭まで届いたかは、届いた側の判断で決める。** どれか 1 本でも先頭に
   届かなければ、それより前のメッセージは見えていない — 全部見えているという顔をしない。 */

/** 観測しているエージェントの誰かから、誰かへ。時刻の順に並ぶ */
export interface PlacedHop {
  readonly fromId: string;
  readonly toId: string;
  readonly hop: AgentHop;
}

/* 相手の端を置けなかったやり取り 1 通。

   **相手の `transcript` は指せていない。** 名乗る名前はセッションの id でも `slug` でも
   なく、こちらが観測した一覧のどれとも一致しない。指せるのは `msgId` だけで、同じ
   プロジェクトのセッションはそれで探しに行く。ここに残るのは、探した先に居なかったものである
   —— 別のプロジェクトのセッションか、開いた `transcript` の読み取り範囲より前に在るものである。 */
export interface PeerExchange {
  readonly atMs: number;
  readonly direction: 'sent' | 'received';
  /** この画面の側の相手。送ったセッションか子の id */
  readonly agentId: string;
  /** 向こう側が自己申告した名前。送ったときは宛先として書いた文字列、届いたときは名乗った名前 */
  readonly peer: string;
  /** 両端を結ぶ鍵 */
  readonly msgId: string;
  /** 送り手が添えた一行。届いた側では持たない */
  readonly summary: string;
  /** 届き方。`prompting` など。**別の値なら別のことである** */
  readonly mode: string | null;
}

export interface SessionMessages {
  readonly hops: readonly PlacedHop[];
  /** この画面に居ないセッションとのやり取り。時刻の順に並ぶ */
  readonly peers: readonly PeerExchange[];
  /** 読み取り範囲が `transcript` の先頭まで届いたか。届いていなければ、これより前のメッセージは見えていない */
  readonly complete: boolean;
  /* 宛先も相手が自己申告した名前も決まらなかったメッセージの数。**別のセッションへ渡ったものは
     ここに入らない** —— そちらは `peers` に、相手の自己申告した名前ごと在る。 */
  readonly unplaced: number;
  /* 相手の端を、当たり得るセッションぜんぶで探せたか。**探し切れなかったことと、相手が
     居なかったことを同じにしない** —— `peers` に残った 1 通は、開いた先には居なかった
     というだけである。 */
  readonly peersComplete: boolean;
}

export interface ObserveMessagesUseCase {
  execute(projectId: string, sessionId: string): Promise<Result<Observation<SessionMessages>>>;
}

/* その一人を指せる文字列を、片端から集める。

   子は id・素の id・宛先に使う名前で指される。セッションは id と、`main` や
   `team-lead` のような決め事で指される — 決め事はどのセッションでも同じ文字列なので、
   ここで**そのセッションのものとして**割り当てる。 */
function addressesOf(session: TranscriptSession): Map<string, string> {
  const addresses = new Map<string, string>();
  const put = (key: string | null, id: string) => {
    if (key !== null && key !== '' && !addresses.has(key)) addresses.set(key, id);
  };
  put(session.id, session.id);
  for (const address of SESSION_ADDRESSES) put(address, session.id);
  for (const subagent of session.subagents) {
    put(subagent.id, subagent.id);
    put(subagent.name, subagent.id);
    // `transcript` に書かれる送り手には接頭辞の `agent-` が付かない。素の文字列からも同じ子へ辿れるようにする
    put(subagent.id.startsWith('agent-') ? subagent.id.slice('agent-'.length) : null, subagent.id);
  }
  return addresses;
}

/* そのセッションが持ち得るやり取りのうち、いちばん近いものとの隔たり。1 つも持ち得ないなら `null`。

   持ち得るのは、始まりと最後の書き込みの間に在る時刻だけである。**始まりを読めていない
   セッションは外さない** —— 読めていないだけで、その 1 行はそこに在るかもしれない。 */
function nearestExchange(session: TranscriptSession, times: readonly number[]): number | null {
  const startedMs = session.startedRaw === null ? Number.NaN : Date.parse(session.startedRaw);
  let nearest: number | null = null;
  for (const at of times) {
    if (at > session.lastActivityMs) continue;
    if (Number.isFinite(startedMs) && at < startedMs) continue;
    const gap = session.lastActivityMs - at;
    if (nearest === null || gap < nearest) nearest = gap;
  }
  return nearest;
}

export function createObserveMessages(deps: {
  readonly tree: TreeSnapshotService;
  readonly transcripts: TranscriptRepository;
}): ObserveMessagesUseCase {
  const { tree, transcripts } = deps;

  /* 片端しか置けなかったやり取りの相手を、同じプロジェクトのセッションに探す。

     結べるのは `msgId` だけである。送った側の `transcript` には結果として、受け取った側には
     届いた記録として、同じ文字列が書かれている。名乗る名前はどの id とも一致しないので、
     ここを名前で結ぶと、観測していない対応を作ることになる。

     近い順に開いて、探しているものが尽きたところでやめる。相手はたいてい、同じ時間に
     動いていた 1 つである。上限まで開いても見つからなかったものは、**見つからなかった
     こととして返す** —— 相手が居なかったことにはしない。 */
  const findPeerEnds = async (
    pending: readonly PeerExchange[],
    sent: ReadonlyMap<string, AgentHop>,
    sessions: readonly TranscriptSession[],
    focusId: string,
  ): Promise<{
    readonly hops: readonly PlacedHop[];
    readonly left: readonly PeerExchange[];
    readonly searchedAll: boolean;
  }> => {
    const wanted = new Map<string, PeerExchange>();
    for (const exchange of pending) wanted.set(exchange.msgId, exchange);
    if (wanted.size === 0) return { hops: [], left: pending, searchedAll: true };

    const times = [...wanted.values()].map((exchange) => exchange.atMs);
    const candidates = sessions
      .filter((candidate) => candidate.id !== focusId)
      .map((candidate) => ({ session: candidate, near: nearestExchange(candidate, times) }))
      .filter((entry): entry is { session: TranscriptSession; near: number } => entry.near !== null)
      .sort((a, b) => a.near - b.near);

    const hops: PlacedHop[] = [];
    let opened = 0;
    let partial = false;
    for (const entry of candidates) {
      if (wanted.size === 0 || opened >= MESSAGE_PEER_SESSIONS) break;
      opened += 1;
      const stat = await transcripts.statTranscript(entry.session.file);
      if (stat.kind !== 'observed') {
        partial = true;
        continue;
      }
      const window = await transcripts.readTail(
        { file: entry.session.file, ...stat.value },
        { maxBytes: MESSAGE_SCAN_BYTES, trimPartialLine: true },
      );
      if (window.kind !== 'observed') {
        partial = true;
        continue;
      }
      // 読み取り範囲が先頭まで届かなかったなら、その先に在ったかどうかは言えない
      if (!window.value.complete) partial = true;
      const text = window.value.text;
      // 探している id が 1 つも現れない本文は、行に組み立てるまでもない
      if (![...wanted.keys()].some((id) => text.includes(id))) continue;

      /* こちらが送った 1 通が、ここに届いていた。**矢は送った側の行から作る** ——
         届いた側の記録は宛先を持たず、送った側の 1 行だけが誰から誰へを言う。 */
      for (const delivery of extractDeliveries(text)) {
        const exchange = wanted.get(delivery.msgId);
        const hop = sent.get(delivery.msgId);
        if (exchange === undefined || hop === undefined) continue;
        hops.push({ fromId: exchange.agentId, toId: entry.session.id, hop });
        wanted.delete(delivery.msgId);
      }
      // こちらへ届いた 1 通を、ここが送っていた
      for (const hop of extractHops(text)) {
        if (hop.msgId === null) continue;
        const exchange = wanted.get(hop.msgId);
        if (exchange === undefined) continue;
        hops.push({ fromId: entry.session.id, toId: exchange.agentId, hop });
        wanted.delete(hop.msgId);
      }
    }

    const left = pending.filter((exchange) => wanted.has(exchange.msgId));
    // 残りが無いなら、探し切れたかを問う相手が居ない
    const searchedAll = left.length === 0 || (!partial && opened === candidates.length);
    return { hops, left, searchedAll };
  };

  return {
    async execute(projectId, sessionId) {
      const snapshot = await tree.get();
      if (!snapshot.ok) return snapshot;

      const project = snapshot.value.projects.find((candidate) => candidate.id === projectId);
      if (project === undefined) return err(new ProjectNotObservedError('Not an observed project'));
      const session = project.sessions.find((candidate) => candidate.id === sessionId);
      if (session === undefined) return err(new SessionNotObservedError('Not an observed session'));

      const addresses = addressesOf(session);
      const owners: { readonly file: string; readonly id: string }[] = [
        { file: session.file, id: session.id },
        ...session.subagents.map((subagent) => ({ file: subagent.file, id: subagent.id })),
      ];

      const placed: PlacedHop[] = [];
      const peers: PeerExchange[] = [];
      /** 送ったほうの記録。相手が見つかったとき、矢はこの 1 行から作る */
      const sent = new Map<string, AgentHop>();
      let complete = true;
      let unplaced = 0;
      for (const owner of owners) {
        /* 大きさは読む直前に採る。木を組んでから開くまでの間にも `transcript` は伸びていて、
           古い大きさで読み取り範囲の先頭を決めると、行の途中から読み始めることになる。 */
        const stat = await transcripts.statTranscript(owner.file);
        if (stat.kind === 'unobservable') return ok(unobservable(stat.error));
        if (stat.kind !== 'observed') continue;
        const window = await transcripts.readTail(
          { file: owner.file, ...stat.value },
          { maxBytes: MESSAGE_SCAN_BYTES, trimPartialLine: true },
        );
        /* 1 本でも開けなければ、メッセージのやり取りそのものを観測できなかったことにする。
           開けた分だけを線にすると、抜けた線が「無かったやりとり」に見える。 */
        if (window.kind === 'unobservable') return ok(unobservable(window.error));
        if (window.kind !== 'observed') continue;
        if (!window.value.complete) complete = false;
        for (const hop of extractHops(window.value.text)) {
          const put = placeHop(hop, owner.id, addresses);
          if (put !== null) {
            placed.push(put);
            continue;
          }
          /* このセッションの誰にも当たらなかった。**`msgId` が在れば、それは届いている** ——
             届いた先は別のセッションで、この画面には居ないというだけである。無ければ
             届いたかどうかも分からないので、置けなかった数として数える。 */
          if (hop.msgId === null) {
            unplaced += 1;
            continue;
          }
          sent.set(hop.msgId, hop);
          peers.push({
            atMs: hop.atMs,
            direction: 'sent',
            agentId: senderOf(hop, owner.id, addresses),
            /* ソケットで名指したメッセージは、相手の名前を持っていない。
               パスをそのまま相手として出すと、プロセスが終われば別のセッションを指す。 */
            peer: peerNameOf(hop.to) ?? '',
            msgId: hop.msgId,
            summary: hop.summary,
            mode: null,
          });
        }

        for (const delivery of extractDeliveries(window.value.text)) {
          peers.push({
            atMs: delivery.atMs,
            direction: 'received',
            agentId: owner.id,
            /* 自己申告した名前が無ければ、届いた先は分かっていても相手が分からない。
               宛先の綴りで代わりにはしない —— ソケットのパスはプロセスを指す。 */
            peer: delivery.fromName ?? '',
            msgId: delivery.msgId,
            summary: '',
            mode: delivery.mode,
          });
        }
      }

      /* 片端しか置けなかったやり取りの、もう一方を同じプロジェクトの中に探す。
         結べるのは `msgId` だけである —— 名乗る名前はどの id とも一致しない。 */
      const found = await findPeerEnds(peers, sent, project.sessions, session.id);
      placed.push(...found.hops);

      placed.sort((a, b) => a.hop.atMs - b.hop.atMs);
      const left = [...found.left].sort((a, b) => a.atMs - b.atMs);
      return ok(
        observed({
          hops: placed,
          peers: left,
          complete,
          unplaced,
          peersComplete: found.searchedAll,
        }),
      );
    },
  };
}
