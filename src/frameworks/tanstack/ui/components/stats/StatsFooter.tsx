import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { usageQuery } from '../../../queries/sessions.query.ts';
import { type ConcurrencyNode, concurrency } from '../../derive/concurrency.ts';
import { binUsage, byModel, gridOf, quotaWindow, totalsOf } from '../../derive/usage.ts';
import { ByModelPanel } from './ByModelPanel.tsx';
import { ConcurrencyPanel } from './ConcurrencyPanel.tsx';
import { TokensPanel } from './TokensPanel.tsx';
import { WindowsPanel } from './WindowsPanel.tsx';

/* 表の下の帯。4 枚が同じ足の長さを共有する。

   分け合っているのは足の長さと窓の始まりと本数の 3 つだけなので、4 枚を 1 つの
   ファイルにする理由が無い。ここは 3 つを配るだけである。 */

const DEFAULT_FOOT_MS = 15 * 60_000;

export function StatsFooter({ project, nowMs }: { project: ProjectJson; nowMs: number }) {
  const [footMs, setFootMs] = useState(DEFAULT_FOOT_MS);
  const usage = useQuery(usageQuery(project.id));

  const { fromMs, bars } = useMemo(() => gridOf(nowMs, footMs), [nowMs, footMs]);

  const buckets = useMemo(() => {
    const response = usage.data;
    // 読めなかったことは空の桶で表さない。空にすると「静かだった」に見える
    if (response === undefined || !response.ok || response.body.state !== 'observed') return [];
    return response.body.buckets;
  }, [usage.data]);

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
        nowMs={nowMs}
        onFoot={setFootMs}
      />
      <ConcurrencyPanel
        counts={counts}
        fromMs={fromMs}
        footMs={footMs}
        bars={bars}
        nowMs={nowMs}
        liveNow={liveNow}
      />
      <ByModelPanel models={models} total={totals.total} />
      <WindowsPanel quota={quota} weekTokens={weekTokens} totals={totals} nowMs={nowMs} />
    </div>
  );
}
