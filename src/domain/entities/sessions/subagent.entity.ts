import type { Observation } from '~/app-kernel/observation.ts';
import type { ActivityIntervalSet } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';
import type { SubagentState } from '~/domain/value-objects/sessions/session-state.value-object.ts';

/** 委譲された仕事 1 つ */
export interface SubagentSession {
  readonly id: string;
  readonly label: string;
  /** 呼ばれ方。呼び名が id しか無いとき、せめてこれで役どころが読める */
  readonly agentType: string | null;
  /** 呼んだ相手の id。セッションが直に呼んだ子では null */
  readonly parentId: string | null;
  /* 子どうしで数えた段。セッションが直に呼んだ子が 1、その子が 2。
   **並びは段の順ではなく親のすぐ下である。** 段は字下げの深さにしか使わない。 */
  readonly depth: number;
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
