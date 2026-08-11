import type { Observation } from '~/app-kernel/observation.ts';
import type { ActivityIntervalSet } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';
import type {
  AwaitingKind,
  SessionState,
} from '~/domain/value-objects/sessions/session-state.value-object.ts';
import type { SubagentSession } from './subagent.entity.ts';

/** セッション 1 つ */
export interface TranscriptSession {
  readonly id: string;
  readonly file: string;
  readonly state: SessionState;
  readonly awaiting: AwaitingKind | null;
  readonly title: string | null;
  /** `transcript` に書かれていた開始時刻の表記。手を加えない */
  readonly startedRaw: string | null;
  /** 自分とサブエージェントのうち、最も新しい書き込み。木の並びと稼働の判定はこれで見る */
  readonly lastActivityMs: number;
  /* 自分だけの書き込み。サブエージェント待ちの判定に要る — サブエージェントが動いていて
     自分が止まっている、という区別は、両者を分けて持っていないと付けられない。 */
  readonly ownMtimeMs: number;
  readonly tokens: Observation<number>;
  readonly model: string | null;
  readonly effort: string | null;
  readonly gitBranch: string | null;
  readonly cwd: string | null;
  readonly issues: readonly string[];
  readonly current: string | null;
  /* 動いていた稼働区間。**観測できたかどうかごと持つ。**

     区間の中身から観測できたかを当てることはできない。静かだった `transcript` も、
     開けなかった `transcript` も、どちらも空の一覧になるからである。
     潰すのは外へ出す直前でよい。 */
  readonly activity: Observation<ActivityIntervalSet>;
  readonly sizeBytes: number;
  readonly subagents: readonly SubagentSession[];
}
