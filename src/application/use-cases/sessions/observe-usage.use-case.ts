import { type Observation, observed } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { ProjectNotObservedError } from '~/application/errors/sessions/not-observed.error.ts';
import type { TranscriptDraftService } from '~/application/services/sessions/transcript-draft.service.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { UsageBucket } from '~/domain/entities/sessions/token-usage.entity.ts';
import { mergeBuckets } from '~/domain/services/sessions/token-usage.service.ts';
import { STATS_WINDOW_MS } from '~/domain/value-objects/sessions/observation-window.value-object.ts';

/* プロジェクト 1 つぶんの消費を、バケットのまま返す。

   **集計したものだけを渡し、バーにするのは観る側の仕事である。** 足の幅も対象期間も
   ユーザーがその場で変えるものなので、こちらで束ねると、幅を変えるたびに `transcript` を
   読み直すことになる。

   対象期間は 7 日。それより古い `transcript` は開かない — 開くには全体を読む必要があり、
   割に合わない。 */

export type { UsageBucket } from '~/domain/entities/sessions/token-usage.entity.ts';

export interface ProjectUsage {
  /* バケットが遡る先。**読めたかどうかに関わらず言える。**
     対象期間の広さは時刻だけで決まるので、`transcript` が開けなくても変わらない。 */
  readonly sinceMs: number;
  readonly buckets: Observation<readonly UsageBucket[]>;
}

export interface ObserveUsageUseCase {
  execute(projectId: string, nowMs: number): Promise<Result<ProjectUsage>>;
}

export function createObserveUsage(deps: {
  readonly tree: TreeSnapshotService;
  readonly drafts: TranscriptDraftService;
}): ObserveUsageUseCase {
  const { tree, drafts } = deps;

  return {
    async execute(projectId, nowMs) {
      const snapshot = await tree.get();
      if (!snapshot.ok) return snapshot;

      /* 引くのは自分の一覧からだけである。**パスは受け取らない。**
         引けない id は、形が違うのも一覧に無いのも同じ断り方をする。 */
      const project = snapshot.value.projects.find((candidate) => candidate.id === projectId);
      if (project === undefined) {
        return err(new ProjectNotObservedError('Not an observed project'));
      }

      const files: string[] = [];
      for (const session of project.sessions) {
        files.push(session.file);
        for (const subagent of session.subagents) files.push(subagent.file);
      }

      const sinceMs = nowMs - STATS_WINDOW_MS;
      const sets: (readonly UsageBucket[])[] = [];
      for (const file of files) {
        const buckets = await drafts.readBuckets(file, nowMs);
        /* 1 つでも読めなければ、統計そのものを観測できなかったことにする。
           読めた分だけを足して出すと、実際より低いバーが「これが全部だ」という顔で並ぶ。 */
        if (buckets.kind === 'unobservable') return ok({ sinceMs, buckets });
        if (buckets.kind === 'observed') sets.push(buckets.value);
      }

      return ok({ sinceMs, buckets: observed(mergeBuckets(sets, sinceMs)) });
    },
  };
}
