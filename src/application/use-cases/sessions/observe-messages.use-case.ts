import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import {
  ProjectNotObservedError,
  SessionNotObservedError,
} from '~/application/errors/sessions/not-observed.error.ts';
import type { TranscriptRepository } from '~/application/ports/repositories/sessions/transcript.repository.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { TranscriptSession } from '~/domain/entities/sessions/session.entity.ts';
import { extractHops, placeHop } from '~/domain/services/sessions/agent-message.service.ts';
import {
  type AgentHop,
  SESSION_ADDRESSES,
} from '~/domain/value-objects/sessions/agent-message.value-object.ts';
import { MESSAGE_SCAN_BYTES } from '~/domain/value-objects/sessions/observation-window.value-object.ts';

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

export interface SessionMessages {
  readonly hops: readonly PlacedHop[];
  /** 読み取り範囲が `transcript` の先頭まで届いたか。届いていなければ、これより前のメッセージは見えていない */
  readonly complete: boolean;
  /** 宛先を置けなかったメッセージの数。読み取り範囲の外の相手へ出ていったもの */
  readonly unplaced: number;
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

export function createObserveMessages(deps: {
  readonly tree: TreeSnapshotService;
  readonly transcripts: TranscriptRepository;
}): ObserveMessagesUseCase {
  const { tree, transcripts } = deps;

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
          if (put === null) unplaced += 1;
          else placed.push(put);
        }
      }

      placed.sort((a, b) => a.hop.atMs - b.hop.atMs);
      return ok(observed({ hops: placed, complete, unplaced }));
    },
  };
}
