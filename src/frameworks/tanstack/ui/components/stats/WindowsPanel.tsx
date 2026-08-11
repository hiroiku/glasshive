import type { Bin, QuotaWindow } from '../../derive/usage.ts';
import { absTime, formatMinutes, formatTokens } from '../../format.ts';
import { isObserved, StatsNote, type StatsObservation } from './StatsObservation.tsx';

/* 利用枠の期間と、週ぶんの合計と、内訳。

   **`transcript` から観測できる範囲の近似である。** 課金側の数字とは一致しないことが
   あり、しかもここに出るのはこのプロジェクトぶんだけである。`title` にそう書いてある。 */

export function WindowsPanel({
  quota,
  weekTokens,
  totals,
  nowMs,
  observation,
}: {
  readonly quota: QuotaWindow;
  readonly weekTokens: number;
  readonly totals: Bin;
  readonly nowMs: number;
  /* 消費をどこまで観測できたか。**観測できていないときは表そのものを出さない** ——
     0 の並びと「idle」は、枠を 1 つも使っていないという断定である。 */
  readonly observation: StatsObservation;
}) {
  const breakdown = `in ${formatTokens(totals.input)} · out ${formatTokens(totals.output)} · cacheW ${formatTokens(totals.cacheWrite)} · cacheR ${formatTokens(totals.cacheRead)}`;

  return (
    <div className="sf-panel sf-win">
      <div className="sf-h">
        <span
          className="sf-title"
          title="Approximated from transcripts (this project only) — may not match billing"
        >
          Windows (observed)
        </span>
      </div>

      {/* 観測できていない枠を、0 と `idle` の並ぶ表で表さない。どちらも「枠を 1 つも
          使っていなかった」という断定である */}
      {!isObserved(observation) ? (
        <StatsNote observation={observation} />
      ) : (
        <div className="sf-wtable">
          <div className="sf-wrow">
            <span className="sf-wk">5h</span>
            {quota.active ? (
              <>
                <span className="sf-mtok">{formatTokens(quota.tokens)}</span>
                <span className="sf-dim">
                  ↻ {absTime(quota.endsAtMs).slice(11)} (in {formatMinutes(quota.endsAtMs - nowMs)})
                </span>
              </>
            ) : (
              <span className="sf-dim sf-span">idle — next prompt opens a window</span>
            )}
          </div>

          <div className="sf-wrow">
            <span className="sf-wk">7d</span>
            <span className="sf-mtok">{formatTokens(weekTokens)}</span>
            <span className="sf-dim">{formatTokens(weekTokens / 7)}/day avg</span>
          </div>

          <div className="sf-wrow">
            <span className="sf-wk">i/o</span>
            <span className="sf-dim sf-span" title={breakdown}>
              {breakdown}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
