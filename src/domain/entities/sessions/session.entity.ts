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
  /** 正本に書かれていた起点の字面。手を加えない */
  readonly startedRaw: string | null;
  /** 自分と子のうち、最も新しい書き込み。木の並びと稼働の判定はこれで見る */
  readonly lastActivityMs: number;
  /* 自分だけの書き込み。子待ちの判定に要る — 子が動いていて自分が止まっている、
     という区別は、両者を分けて持っていないと付けられない。 */
  readonly ownMtimeMs: number;
  readonly tokens: Observation<number>;
  readonly model: string | null;
  readonly effort: string | null;
  readonly gitBranch: string | null;
  readonly cwd: string | null;
  readonly actor: string | null;
  readonly issues: readonly string[];
  readonly current: string | null;
  /* 動いていた帯。**読めたかどうかごと持つ。**

     帯の中身から読めたかを当てることはできない。静かだった正本も、開けなかった
     正本も、どちらも空の一覧になるからである。潰すのは外へ出す直前でよい。 */
  readonly activity: Observation<ActivityIntervalSet>;
  readonly sizeBytes: number;
  readonly subagents: readonly SubagentSession[];
}
