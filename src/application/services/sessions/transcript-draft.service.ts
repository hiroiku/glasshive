import { absent, mapObserved, type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  SessionSource,
  TranscriptLocation,
  TranscriptRepository,
  TranscriptSource,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import {
  createTranscriptMemo,
  stampOf,
} from '~/application/services/sessions/transcript-memo.service.ts';
import type { UsageBucket } from '~/domain/entities/sessions/token-usage.entity.ts';
import { deriveActivity } from '~/domain/services/sessions/activity-interval.service.ts';
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
  subagentIdOf,
} from '~/domain/value-objects/sessions/subagent-id.value-object.ts';

/* 素材に読み解きを当てて、正本 1 つぶんの下書きを組む。

   **どこまで読むかを決めるのはここである。** 置き場の口は「ここからここまで」と
   言われて開くだけで、幅も繕い方も知らない。幅は domain の窓の値をそのまま渡す。

   **どれか 1 つが読めなくても、下書きは返す。** 読めなかった事実はその欄に残す。
   欠けたところだけが黙り、残りは今までどおり見える、というのが観測の道具のあるべき姿である。 */

export interface TranscriptDraftService {
  readSession(source: SessionSource, nowMs: number): Promise<DraftSession>;
  /* 正本ひとつの桶。**木を組んだときの覚えをそのまま使う。**

     別に覚えを持つと、同じ 8MiB を二度読んで二度抱えることになる。統計が見たいのは
     木の Tokens 列と同じ素材なので、分ける理由が無い。 */
  readBuckets(file: string, nowMs: number): Promise<Observation<readonly UsageBucket[]>>;
  /** 歩いて見えなくなった正本の覚えを落とす。歩けた周にだけ呼ぶこと */
  keepOnly(live: ReadonlySet<string>): void;
}

export function createTranscriptDrafts(deps: {
  readonly transcripts: TranscriptRepository;
  readonly activeThresholdMs: number;
}): TranscriptDraftService {
  const { transcripts, activeThresholdMs } = deps;
  /* 畳んだ結果を覚える。**開く手間も、畳み直す手間も、どちらも省ける。**
     ここで覚えるのは、置き場の口が素材しか知らないからである — 何を畳んだのかを
     知っているのはこの側だけで、鍵が変われば答えも変わると言い切れるのもここだけである。 */
  const memo = createTranscriptMemo();

  /* セッションの見出しは、頭と尻を 1 本の並びとして辿って導く。
     どちらの窓も行として読み解くので、端で切れた行は繕って落とす。 */
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
    /* 尻が読めなくても、頭で読めた分は捨てない。捨てると作業場所まで消える —
       作業場所が消えた巣には道具を配れないので、待っているセッションが残らず
       終了へ倒れ、しかも観る人からは静かな巣にしか見えない。

       ただし末尾を見ていない以上、**自分の番が終わっているとは言えない**。
       頭の最後の形をそのまま待ちに読み替えると、走っている最中のセッションが
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

  /* 子の見出し。**止まっている子の尻は開かない** — モデルもエフォートも委譲のときに
     決まるので、頭を読めば足りる。頭は行の切れ目を繕わない。切れた行は読めずに
     落ちるだけで、要るものは先頭に揃う。 */
  async function readSubagentMeta(
    at: TranscriptLocation,
    active: boolean,
  ): Promise<Observation<SubagentMeta>> {
    /* 動いているかを鍵に混ぜる。**開く窓が違えば、畳んだ結果も違う。**
       混ぜないと、止まっていたころの見出しが動き出した後も返り続ける。 */
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
    /* 尻が読めなければ、止まっている子と同じところまでで止める。頭ごと捨てると、
       委譲のときに決まっていたモデルも作業場所も消える — 読めた分まで黙る理由が無い。 */
    if (tail.kind !== 'observed') return observed(parseSubagentMeta(head.value.text, null));
    return observed(parseSubagentMeta(head.value.text, tail.value.text));
  }

  /* 動いていた帯。時刻は行として読まずに字面から拾うので、切れた行は繕わない。
     先頭まで届いたかは読んだ側にしか分からないので、そのまま渡す。 */
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

  /** 使ったトークン。**窓より古い正本は開かない。読んでいないのであって、消費が無いのではない** */
  async function readUsage(
    at: TranscriptLocation,
    nowMs: number,
  ): Promise<Observation<readonly UsageBucket[]>> {
    /* 窓の外かどうかは今の時刻で決まるので、覚えの外で見る。
       中に入れると、一度窓の外だった正本が窓に入っても外のままになる。 */
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

  async function readSubagent(source: TranscriptSource, nowMs: number): Promise<DraftSubagent> {
    const active = isWithinThreshold(nowMs, source.mtimeMs, activeThresholdMs);
    const meta = await readSubagentMeta(source, active);
    const activity = await readActivity(source);
    const usage = await readUsage(source, nowMs);
    const found = meta.kind === 'observed' ? meta.value : undefined;
    // 同一性と呼び名は別物。剥がした呼び名を鍵に使うと、指紋だけが違う子が同じものに見える
    const { id, label } = subagentIdOf(source.fileName);
    return {
      id,
      label,
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
      /* 潰さずに渡す。ここで空の帯に均すと、開けなかった正本が
         「ずっと静かだった」ものとして木に並ぶ。 */
      activity,
    };
  }

  return {
    keepOnly(live) {
      memo.keepOnly(live);
    },

    async readBuckets(file, nowMs) {
      /* 鮮度は読む直前に採る。歩いたときの数を使い回すと、その後に伸びた分が
         覚えの鍵に映らず、古い畳み方が返り続ける。 */
      const stat = await transcripts.statTranscript(file);
      if (stat.kind !== 'observed') return stat;
      return readUsage({ file, ...stat.value }, nowMs);
    },

    async readSession(source, nowMs) {
      /* 子の棚には、子の正本でないものが混じり得る。名前で見分けるのは言葉を持つ側の仕事で、
         口はただ棚に在った正本を並べてくる。 */
      const subagentSources = source.subagents.filter((child) =>
        isSubagentFileName(child.fileName),
      );
      /* 窓は 1 つずつ開ける。**まとめて始めても速くならない。**

         置き場を読むのに待ち時間は無いので、並べて始めたところで待ち合わせるものが無い。
         そのかわり、開いた窓が全部いっぺんに居座る — 正本ひとつで最大 12MiB、
         子を数百抱えた巣なら、それが数百ぶん同時に生きることになる。 */
      const meta = await readSessionMeta(source);
      const activity = await readActivity(source);
      const usage = await readUsage(source, nowMs);
      const subagents: DraftSubagent[] = [];
      for (const child of subagentSources) subagents.push(await readSubagent(child, nowMs));
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
