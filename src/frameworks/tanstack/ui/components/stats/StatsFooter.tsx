import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { usageQuery } from '../../../queries/sessions.query.ts';
import {
  type ConcurrencyNode,
  concurrency,
  unobservableConcurrency,
} from '../../derive/concurrency.ts';
import { autoWindow, type TimeWindow } from '../../derive/timeWindow.ts';
import { binUsage, byModel, footFor, gridOf, quotaWindow, totalsOf } from '../../derive/usage.ts';
import { ByModelPanel } from './ByModelPanel.tsx';
import { ConcurrencyPanel } from './ConcurrencyPanel.tsx';
import type { StatsObservation } from './StatsObservation.tsx';
import { TokensPanel } from './TokensPanel.tsx';
import { WindowsPanel } from './WindowsPanel.tsx';

/* 表の下のバー。4 枚のパネルが同じ `footMs` を共有する。

   分け合っているのはバー 1 本の長さと期間の始まりと本数、それに素材をどこまで観測できたかの
   4 つだけなので、4 枚を 1 つのファイルにする理由が無い。ここはその 4 つを配るだけである。 */

export function StatsFooter({ project, nowMs }: { project: ProjectJson; nowMs: number }) {
  const [window, setWindow] = useState<TimeWindow>('auto');
  const usage = useQuery(usageQuery(project.id));

  /* 消費をどこまで観測できたか。**空のバケットで表さない** —— まだ答えが来ていないのと、
     読んで何も無かったのと、`transcript` を開けなかったのは別の事実で、どれも同じ
     平らな 0 のグラフになってはいけない。3 枚のパネルはこれを見て、数を出すかどうかを決める。 */
  const spend = useMemo<StatsObservation>(() => {
    const response = usage.data;
    // 往復そのものが落ちたときはエラーコードを持てない。それでも観測できなかったことに変わりはない
    if (response === undefined) {
      return usage.isError ? { kind: 'unobservable', reason: null } : { kind: 'pending' };
    }
    if (!response.ok) return { kind: 'unobservable', reason: response.body.code };
    const { state, reason } = response.body;
    if (state === 'unobservable') return { kind: 'unobservable', reason };
    return state === 'absent' ? { kind: 'absent' } : { kind: 'observed' };
  }, [usage.data, usage.isError]);

  // 描く素材。観測できたかは `spend` が運ぶので、ここは「描くものが 1 つも無い」だけを表す
  const buckets = useMemo(() => {
    const response = usage.data;
    if (response === undefined || !response.ok || response.body.state !== 'observed') return [];
    return response.body.buckets;
  }, [usage.data]);

  /* `auto` は「実際に消費が在るところがちょうど収まる幅」。**空のバケットは数えない** ——
     数えると、素材が遡る 7 日ぶんが常に選ばれて、いつも同じ幅になる。 */
  const oldestMs = useMemo(() => {
    let oldest: number | null = null;
    for (const bucket of buckets) {
      if (bucket.i + bucket.o + bucket.cw <= 0) continue;
      if (oldest === null || bucket.t < oldest) oldest = bucket.t;
    }
    return oldest;
  }, [buckets]);

  const spanMs = window === 'auto' ? autoWindow(oldestMs, nowMs) : window;
  const footMs = footFor(spanMs);

  const { fromMs, bars } = useMemo(() => gridOf(nowMs, footMs, spanMs), [nowMs, footMs, spanMs]);

  const inRange = useMemo(() => buckets.filter((bucket) => bucket.t >= fromMs), [buckets, fromMs]);
  const bins = useMemo(
    () => binUsage(inRange, fromMs, footMs, bars),
    [inRange, fromMs, footMs, bars],
  );
  const models = useMemo(() => byModel(inRange), [inRange]);
  const totals = useMemo(() => totalsOf(inRange), [inRange]);
  const quota = useMemo(() => quotaWindow(buckets, nowMs), [buckets, nowMs]);
  const weekTokens = useMemo(() => totalsOf(buckets).total, [buckets]);

  const nodes = useMemo<ConcurrencyNode[]>(() => {
    const list: ConcurrencyNode[] = [];
    for (const session of project.sessions) {
      list.push(session);
      for (const subagent of session.subagents) list.push(subagent);
    }
    return list;
  }, [project]);

  const counts = useMemo(
    () => concurrency(nodes, fromMs, footMs, bars, nowMs),
    [nodes, fromMs, footMs, bars, nowMs],
  );

  /* 稼働を観測できなかったエージェントは、`counts` とは別の数として数える。**同じ数に
     足さない。** 足せば読めなかったことが動いていたことになり、落とせば静かだったことになる。 */
  const unknownRuns = useMemo(
    () => unobservableConcurrency(nodes, fromMs, footMs, bars, nowMs),
    [nodes, fromMs, footMs, bars, nowMs],
  );

  /* 稼働区間の素材をどこまで受け取れたか。**`read` だけでは決まらない** —— `read` は中身を
     読み終えたかを言うだけで、読む相手を数え上げられたかは `sources` にしか残らない。走査に
     失敗したプロジェクトは読み終えた後も `sessions` が空のままなので、`read` だけで決めると
     「誰も動いていなかった」という平らな階段になる。

     **読めなかったエージェントを理由に階段を消さない** —— 消すと、20 本中 1 本読めなかった
     プロジェクトが 1 本も読めていないプロジェクトと同じ絵になる。読めなかった分は
     `unknownRuns` が別の面として運ぶ。 */
  const runs = useMemo<StatsObservation>(() => {
    if (!project.read) return { kind: 'pending' };
    const { state, reason } = project.sources;
    if (state === 'unobservable') return { kind: 'unobservable', reason };
    return state === 'absent' ? { kind: 'absent' } : { kind: 'observed' };
  }, [project.read, project.sources]);

  /* 数え上げられなかったエージェントが居るか。**プロジェクトのディレクトリと、セッションごとの
     子のディレクトリの両方を見る。** どちらか一方でも歩けていなければ、`counts` も `liveNow` も
     同じだけ足りない —— どちらも `project.sessions` と `session.subagents` を回して数えている。

     **数え損ねた分を黙って落とさない** —— 落とせば、数えられた高さが全部だったことになる。
     何人居たのかは分からないので、数には足さず、その数が下限であることだけを言う。 */
  const uncounted = useMemo(
    () =>
      project.sources.state === 'unobservable' ||
      project.sessions.some((session) => session.sources.state === 'unobservable'),
    [project.sources, project.sessions],
  );

  const liveNow = useMemo(() => {
    let live = 0;
    for (const session of project.sessions) {
      if (session.state === 'active') live += 1;
      for (const subagent of session.subagents) if (subagent.state === 'active') live += 1;
    }
    return live;
  }, [project]);

  return (
    <div id="stats-footer">
      <TokensPanel
        bins={bins}
        fromMs={fromMs}
        footMs={footMs}
        bars={bars}
        window={window}
        nowMs={nowMs}
        onWindow={setWindow}
        observation={spend}
      />
      <ConcurrencyPanel
        counts={counts}
        unknown={unknownRuns}
        fromMs={fromMs}
        footMs={footMs}
        bars={bars}
        nowMs={nowMs}
        liveNow={liveNow}
        uncounted={uncounted}
        observation={runs}
      />
      <ByModelPanel models={models} total={totals.total} observation={spend} />
      <WindowsPanel
        quota={quota}
        weekTokens={weekTokens}
        totals={totals}
        nowMs={nowMs}
        observation={spend}
      />
    </div>
  );
}
