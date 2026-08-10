import type { Observation } from '~/app-kernel/observation.ts';
import type { ActivityIntervalSet } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';
import type { SubagentState } from '~/domain/value-objects/sessions/session-state.value-object.ts';

/** 委譲された仕事 1 つ */
export interface SubagentSession {
  readonly id: string;
  readonly label: string;
  /** どの種類として呼ばれたか。ラベルが id しか無いとき、せめてこれで役どころが読める */
  readonly agentType: string | null;
  /* 呼びかけに使う名前。サブエージェントどうしはこの文字列で互いを呼ぶ。持たないものも居る */
  readonly name: string | null;
  /** どの `tool_use` から生まれたか。本文の中ではこの id で指されることがある */
  readonly toolUseId: string | null;
  /** 呼んだ親の id。セッションが直に呼んだサブエージェントでは null */
  readonly parentId: string | null;
  /* サブエージェント間で数えた深さ。セッションが直に呼んだものが 1、それが呼んだものが 2。
   **並びは深さの順ではなく親のすぐ下である。** `depth` はインデントにしか使わない。 */
  readonly depth: number;
  readonly file: string;
  readonly state: SubagentState;
  /** `transcript` に書かれていた開始時刻の表記。手を加えない */
  readonly startedRaw: string | null;
  readonly lastActivityMs: number;
  /* 数が無いことにも理由がある。対象期間の外(古すぎる)なのか、観測できなかったのかを分ける。
     どちらも同じ「数が無い」に潰すと、ユーザーには見分けが付かない。 */
  readonly tokens: Observation<number>;
  readonly model: string | null;
  readonly effort: string | null;
  readonly gitBranch: string | null;
  readonly cwd: string | null;
  /** 取り組んでいる課題。作業ディレクトリの名前 1 つから導く */
  readonly issue: string | null;
  readonly current: string | null;
  /** 動いていた稼働区間。セッションと同じく、観測できたかどうかごと持つ */
  readonly activity: Observation<ActivityIntervalSet>;
}
