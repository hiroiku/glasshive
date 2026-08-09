import type { Observation } from '~/app-kernel/observation.ts';
import type { ActivityIntervalSet } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';
import type { SubagentState } from '~/domain/value-objects/sessions/session-state.value-object.ts';

/** 委譲された仕事 1 つ */
export interface SubagentSession {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly state: SubagentState;
  /** 正本に書かれていた起点の字面。手を加えない */
  readonly startedRaw: string | null;
  readonly lastActivityMs: number;
  /* 見えないことにも理由がある。窓の外(古すぎる)なのか、読めなかったのかを分ける。
     どちらも同じ「数が無い」に潰すと、観る人には見分けが付かない。 */
  readonly tokens: Observation<number>;
  readonly model: string | null;
  readonly effort: string | null;
  readonly gitBranch: string | null;
  readonly cwd: string | null;
  /** 取り組んでいる課題。作業場所の名前 1 つから導く */
  readonly issue: string | null;
  readonly current: string | null;
  /** 動いていた帯。セッションと同じく、読めたかどうかごと持つ */
  readonly activity: Observation<ActivityIntervalSet>;
}
