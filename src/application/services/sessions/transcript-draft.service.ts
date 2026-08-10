import { absent, mapObserved, type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  SessionSource,
  SubagentSource,
  TranscriptLocation,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import {
  createTranscriptMemo,
  stampOf,
} from '~/application/services/sessions/transcript-memo.service.ts';
import type { UsageBucket } from '~/domain/entities/sessions/token-usage.entity.ts';
import { deriveActivity } from '~/domain/services/sessions/activity-interval.service.ts';
import { placeByLineage } from '~/domain/services/sessions/agent-lineage.service.ts';
import type { LocatedSession } from '~/domain/services/sessions/project-index.service.ts';
import type {
  DraftSession,
  DraftSubagent,
} from '~/domain/services/sessions/project-tree.service.ts';
import {
  isWithinThreshold,
  isWithinTokenWindow,
} from '~/domain/services/sessions/session-state.service.ts';
import {
  bucketByFiveMinutes,
  extractUsageRecords,
  tokensSince,
  totalTokens,
} from '~/domain/services/sessions/token-usage.service.ts';
import {
  parseSessionMeta,
  parseSubagentMeta,
  type SessionMeta,
  type SubagentMeta,
} from '~/domain/services/sessions/transcript-meta.service.ts';
import type { ActivityIntervalSet } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';
import { MAX_SESSION_ISSUES } from '~/domain/value-objects/sessions/issue-mention.value-object.ts';
import {
  HEAD_BYTES,
  INTERVAL_SCAN_BYTES,
  RECENT_WINDOW_MS,
  SUB_HEAD_BYTES,
  SUB_TAIL_BYTES,
  TAIL_BYTES,
  TOKEN_AGE_MS,
  USAGE_SCAN_BYTES,
} from '~/domain/value-objects/sessions/observation-window.value-object.ts';
import {
  isSubagentFileName,
  resolveSubagentId,
  subagentIdOf,
} from '~/domain/value-objects/sessions/subagent-id.value-object.ts';
import {
  TITLE_MAX_CHARS,
  truncateChars,
} from '~/domain/value-objects/sessions/text-limit.value-object.ts';

/* 素材をパースして、`transcript` 1 つぶんの下書きを組む。

   どこまで読むかを決めるのはここである。`~/.claude/projects` を読むポートは「ここからここまで」と
   言われて開くだけで、幅も繕い方も知らない。幅は domain が持つ読み取り範囲の値を
   そのまま渡す。

   **どれか 1 つが読めなくても、下書きは返す。** 読めなかった事実はその欄に残す。
   欠けたところだけが黙り、残りは今までどおり見える、というのが観測ツールのあるべき姿である。 */

/* `depth` がまだ付いていない子。深さは木に入れ直して初めて決まる。
   0 を仮に置いて後から書き換えると、書き換え漏れが根と見分けの付かない値になる。 */
type FlatSubagent = Omit<DraftSubagent, 'depth'>;

/* 呼んだ側が添えた一行を、ラベルに仕立てる。

   `description` は改行を挟んだ数行のことがあるので、1 行へ潰してから題と同じ長さで丸める。
   潰さずに渡すと、木の 1 行の中で改行が空白として散らばり、隣の欄まで押し出す。 */
function describedLabel(description: string | null): string | null {
  if (description === null) return null;
  const line = description.replace(/\s+/g, ' ').trim();
  return line === '' ? null : truncateChars(line, TITLE_MAX_CHARS);
}

/* `description` の一行が無い子に、せめて「どの実行の仲間か」を持たせる。

   1 回の実行の中で産まれた子には `description` が書かれないので、キーから起こしたラベルは
   16 進のままになる。同じ実行の 4 つが 16 進で並ぶと、一つの実行だったことも読めない。
   ディレクトリ名を頭に付ければ、並べただけで仲間が揃い、指紋で一つずつを見分けられる。

   **ディレクトリ名に書いてあること以上は足さない。** その実行が何をしていたかは、
   どこにも書かれていない。 */
function runScopedLabel(runId: string | null, label: string): string {
  return runId === null ? label : `${runId}/${label}`;
}

export interface TranscriptDraftService {
  readSession(source: SessionSource, nowMs: number): Promise<DraftSession>;
  /* 作業ディレクトリだけを求める。**中身の読み取りは、この後の本読みと共有される。**

     読むのは先頭と末尾だけで、それは `readSession` が最初にやることと同じ範囲である。
     結果は同じキーで覚えてあるので、本読みは開き直さない。索引のための読みは、
     総量としては足されない。 */
  readLocation(
    source: SessionSource,
  ): Promise<LocatedSession & { readonly transcriptCount: number }>;
  /* `transcript` ひとつぶんのバケット。**木を組んだときのキャッシュをそのまま使う。**

     別にキャッシュを持つと、同じ 8MiB を二度読んで二度抱えることになる。統計が見たいのは
     木の Tokens 列と同じ素材なので、分ける理由が無い。 */
  readBuckets(file: string, nowMs: number): Promise<Observation<readonly UsageBucket[]>>;
  /** 走査して見えなくなった `transcript` のキャッシュを落とす。走査できた周にだけ呼ぶこと */
  keepOnly(live: ReadonlySet<string>): void;
}

export function createTranscriptDrafts(deps: {
  readonly transcripts: TranscriptRepository;
  readonly activeThresholdMs: number;
}): TranscriptDraftService {
  const { transcripts, activeThresholdMs } = deps;
  /* 集計した結果を覚える。**開く手間も、集計し直す手間も、どちらも省ける。**
     ここで覚えるのは、`~/.claude/projects` を読むポートが素材しか知らないからである —
     何を集計したのかを知っているのはこの側だけで、キーが変われば結果も変わると
     言い切れるのもここだけである。 */
  const memo = createTranscriptMemo();

  /* セッションのメタ情報は、先頭と末尾を 1 本の並びとして辿って導く。
     どちらの読み取り範囲も行としてパースするので、端で切れた行は繕って落とす。 */
  async function readSessionMeta(at: TranscriptLocation): Promise<Observation<SessionMeta>> {
    return memo.read(`meta:${at.file}`, at.file, stampOf(at), () => loadSessionMeta(at));
  }

  async function loadSessionMeta(at: TranscriptLocation): Promise<Observation<SessionMeta>> {
    const head = await transcripts.readHead(at, {
      maxBytes: HEAD_BYTES,
      trimPartialLine: true,
    });
    if (head.kind !== 'observed') return head;
    const tail = await transcripts.readTail(at, {
      maxBytes: TAIL_BYTES,
      trimPartialLine: true,
    });
    /* 末尾が読めなくても、先頭で読めた分は捨てない。捨てると作業ディレクトリまで消える —
       作業ディレクトリが消えたプロジェクトにはプロセスを割り振れないので、待っているセッションが
       残らず終了へ倒れ、しかもユーザーからは静かなプロジェクトにしか見えない。

       ただし末尾を見ていない以上、**自分の番が終わっているとは言えない**。
       先頭で見えた最後の形をそのまま待ちに読み替えると、走っている最中のセッションが
       「あなたの返事待ち」として並ぶ。 */
    if (tail.kind !== 'observed') {
      const partial = parseSessionMeta(head.value.text, '');
      return observed({
        ...partial,
        awaitingCandidate: false,
        lastEventShape: null,
      });
    }
    return observed(parseSessionMeta(head.value.text, tail.value.text));
  }

  /* 子のメタ情報。**止まっている子の末尾は開かない** — モデルもエフォートも委譲のときに
     決まるので、先頭を読めば足りる。先頭は行の切れ目を繕わない。切れた行は読めずに
     落ちるだけで、要るものは先頭に揃う。 */
  async function readSubagentMeta(
    at: TranscriptLocation,
    active: boolean,
  ): Promise<Observation<SubagentMeta>> {
    /* 動いているかをキーに混ぜる。**読み取る範囲が違えば、集計した結果も違う。**
       混ぜないと、止まっていたころのメタ情報が動き出した後も返り続ける。 */
    return memo.read(`submeta:${active}:${at.file}`, at.file, stampOf(at), () =>
      loadSubagentMeta(at, active),
    );
  }

  async function loadSubagentMeta(
    at: TranscriptLocation,
    active: boolean,
  ): Promise<Observation<SubagentMeta>> {
    const head = await transcripts.readHead(at, {
      maxBytes: SUB_HEAD_BYTES,
      trimPartialLine: false,
    });
    if (head.kind !== 'observed') return head;
    if (!active) return observed(parseSubagentMeta(head.value.text, null));
    const tail = await transcripts.readTail(at, {
      maxBytes: SUB_TAIL_BYTES,
      trimPartialLine: true,
    });
    /* 末尾が読めなければ、止まっている子と同じところまでで止める。先頭ごと捨てると、
       委譲のときに決まっていたモデルも作業ディレクトリも消える — 読めた分まで黙る理由が無い。 */
    if (tail.kind !== 'observed') return observed(parseSubagentMeta(head.value.text, null));
    return observed(parseSubagentMeta(head.value.text, tail.value.text));
  }

  /* 動いていた稼働区間。時刻は行として読まず、テキストをそのまま走査して拾うので、
     切れた行は繕わない。先頭まで届いたかは読んだ側にしか分からないので、そのまま渡す。 */
  async function readActivity(at: TranscriptLocation): Promise<Observation<ActivityIntervalSet>> {
    return memo.read(`activity:${at.file}`, at.file, stampOf(at), () => loadActivity(at));
  }

  async function loadActivity(at: TranscriptLocation): Promise<Observation<ActivityIntervalSet>> {
    const tail = await transcripts.readTail(at, {
      maxBytes: INTERVAL_SCAN_BYTES,
      trimPartialLine: false,
    });
    if (tail.kind !== 'observed') return tail;
    return observed(deriveActivity(tail.value.text, tail.value.complete));
  }

  /** 使ったトークン。**対象期間より古い `transcript` は開かない。読んでいないのであって、消費が無いのではない** */
  async function readUsage(
    at: TranscriptLocation,
    nowMs: number,
  ): Promise<Observation<readonly UsageBucket[]>> {
    /* 対象期間の外かどうかは今の時刻で決まるので、キャッシュの外で見る。
       中に入れると、一度期間の外だった `transcript` が期間に入っても外のままになる。 */
    if (!isWithinTokenWindow(nowMs, at.mtimeMs, TOKEN_AGE_MS)) return absent('out-of-window');
    return memo.read(`usage:${at.file}`, at.file, stampOf(at), () => loadUsage(at));
  }

  async function loadUsage(at: TranscriptLocation): Promise<Observation<readonly UsageBucket[]>> {
    const tail = await transcripts.readTail(at, {
      maxBytes: USAGE_SCAN_BYTES,
      trimPartialLine: false,
    });
    if (tail.kind !== 'observed') return tail;
    return observed(bucketByFiveMinutes(extractUsageRecords(tail.value.text)));
  }

  async function readSubagent(source: SubagentSource, nowMs: number): Promise<FlatSubagent> {
    const active = isWithinThreshold(nowMs, source.mtimeMs, activeThresholdMs);
    const meta = await readSubagentMeta(source, active);
    const activity = await readActivity(source);
    const usage = await readUsage(source, nowMs);
    const found = meta.kind === 'observed' ? meta.value : undefined;
    // 同一性とラベルは別物。剥がしたラベルをキーに使うと、指紋だけが違う子が同じものに見える
    const { id, label } = subagentIdOf(source.fileName);
    return {
      id,
      /* 呼んだ側が添えた一行が、何をしている子かを語る唯一の言葉である。
         無ければ名前から起こしたもの、それも空ならキーそのものに倒し、
         実行の中に居たならそのディレクトリ名を頭に付ける。 */
      label:
        describedLabel(source.meta?.description ?? null) ??
        runScopedLabel(source.runId, label === '' ? id : label),
      agentType: source.meta?.agentType ?? null,
      name: source.meta?.name ?? null,
      toolUseId: source.meta?.toolUseId ?? null,
      /* 呼んだ相手は `*.meta.json` にしか書かれていない。読めなければ根として並ぶ */
      parentId: source.meta?.parentAgentId ?? null,
      file: source.file,
      startedRaw: found?.startedRaw ?? null,
      lastActivityMs: source.mtimeMs,
      tokens: mapObserved(usage, totalTokens),
      recentTokens: mapObserved(usage, (buckets) => tokensSince(buckets, nowMs - RECENT_WINDOW_MS)),
      model: found?.model ?? null,
      effort: found?.effort ?? null,
      gitBranch: found?.gitBranch ?? null,
      cwd: found?.cwd ?? null,
      issue: found?.issue ?? null,
      current: found?.current ?? null,
      /* 潰さずに渡す。ここで空の稼働区間に均すと、開けなかった `transcript` が
         「ずっと静かだった」ものとして木に並ぶ。 */
      activity,
    };
  }

  return {
    keepOnly(live) {
      memo.keepOnly(live);
    },

    async readLocation(source) {
      /* 数え方を `readSession` と揃える。子のディレクトリには子の `transcript` でないものが
         混じり得るので、同じ述語で落とす。**落とし方が違うと、読み終えた数が総数を追い越す。** */
      const subagentSources = source.subagents.filter((child) =>
        isSubagentFileName(child.fileName),
      );
      const meta = await readSessionMeta(source);
      const found = meta.kind === 'observed' ? meta.value : undefined;
      return {
        file: source.file,
        cwd: found?.cwd ?? null,
        // 木の並びは、自分と子のうち最も新しい書き込みで決まる。`readSession` と同じ測り方
        lastActivityMs: subagentSources.reduce(
          (latest, child) => Math.max(latest, child.mtimeMs),
          source.mtimeMs,
        ),
        transcriptCount: 1 + subagentSources.length,
      };
    },

    async readBuckets(file, nowMs) {
      /* 鮮度は読む直前に採る。走査したときの数を使い回すと、その後に伸びた分が
         キャッシュのキーに映らず、古い集計結果が返り続ける。 */
      const stat = await transcripts.statTranscript(file);
      if (stat.kind !== 'observed') return stat;
      return readUsage({ file, ...stat.value }, nowMs);
    },

    async readSession(source, nowMs) {
      /* 子のディレクトリには、子の `transcript` でないものが混じり得る。名前で見分けるのは
         言葉を持つ側の仕事で、ポートはただディレクトリに在ったファイルを並べてくる。 */
      const subagentSources = source.subagents.filter((child) =>
        isSubagentFileName(child.fileName),
      );
      /* 読み取りは 1 つずつ行う。**まとめて始めても速くならない。**

         `~/.claude/projects` を読むのに待ち時間は無いので、並列に始めたところで
         待ち合わせるものが無い。そのかわり、読み取ったテキストが全部いっぺんに居座る —
         `transcript` ひとつで最大 12MiB、子を数百抱えたプロジェクトなら、それが数百ぶん
         同時に生きることになる。 */
      const meta = await readSessionMeta(source);
      const activity = await readActivity(source);
      const usage = await readUsage(source, nowMs);
      const flat: FlatSubagent[] = [];
      for (const child of subagentSources) flat.push(await readSubagent(child, nowMs));
      const ids = new Set(flat.map((child) => child.id));
      const linked = flat.map((child) => ({
        ...child,
        parentId: resolveSubagentId(child.parentId, ids),
      }));
      /* 平らな一覧を木に入れ直す。**何を先に見せるかを決めるのはここで、形を決めるのは domain である。**
         渡した順は兄弟どうしの並びとして保たれるので、ここで並べ替えてから通す必要は無い。 */
      const subagents: DraftSubagent[] = placeByLineage(linked).map(({ node, depth }) => ({
        ...node,
        depth,
      }));
      const found = meta.kind === 'observed' ? meta.value : undefined;
      // 木の並びと稼働の判定は、自分と子のうち最も新しい書き込みで決まる
      const lastActivityMs = subagents.reduce(
        (latest, sub) => Math.max(latest, sub.lastActivityMs),
        source.mtimeMs,
      );
      return {
        id: source.id,
        file: source.file,
        title: found?.title ?? null,
        startedRaw: found?.startedRaw ?? null,
        lastActivityMs,
        ownMtimeMs: source.mtimeMs,
        awaitingCandidate: found?.awaitingCandidate ?? false,
        tokens: mapObserved(usage, totalTokens),
        recentTokens: mapObserved(usage, (buckets) =>
          tokensSince(buckets, nowMs - RECENT_WINDOW_MS),
        ),
        model: found?.model ?? null,
        effort: found?.effort ?? null,
        gitBranch: found?.gitBranch ?? null,
        cwd: found?.cwd ?? null,
        actor: found?.actor ?? null,
        issues: (found?.issues ?? []).slice(0, MAX_SESSION_ISSUES),
        current: found?.current ?? null,
        activity,
        sizeBytes: source.sizeBytes,
        subagents,
      };
    },
  };
}
