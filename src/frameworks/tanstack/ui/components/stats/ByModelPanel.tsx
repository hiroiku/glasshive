import { formatTokens, modelShort } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';
import { laneColor } from '../../palette.ts';
import { isObserved, StatsNote, type StatsObservation } from './StatsObservation.tsx';

/* どのモデルがどれだけ使ったか。

   表として列を揃えるのは、行ごとに並べると桁がずれて比べられなくなるからである。
   `.sf-mrow` は `display: contents` で親の列へ直に流し込む — **ラッパーを増やさない。** */

/** 名前を出す行数の上限。それより下は件数だけ添える */
const NAMED_ROWS = 4;

export function ByModelPanel({
  models,
  total,
  observation,
}: {
  readonly models: readonly (readonly [string, number])[];
  readonly total: number;
  /* 消費をどこまで観測できたか。**空の一覧を「no usage」と言い切らない** ——
     読めなかったプロジェクトは、使っていないプロジェクトではない。 */
  readonly observation: StatsObservation;
}) {
  const t = useT();
  return (
    <div className="sf-panel sf-models">
      <div className="sf-h">
        <span className="sf-title">{t('By model')}</span>
      </div>

      {!isObserved(observation) ? (
        <StatsNote observation={observation} />
      ) : models.length === 0 ? (
        <div className="sf-dim">{t('no usage in range')}</div>
      ) : (
        <>
          <div className="sf-stack">
            {models.map(([model, value], index) => (
              <i
                key={model}
                style={{
                  width: `${(value / Math.max(1, total)) * 100}%`,
                  background: laneColor(index),
                }}
                title={`${model} · ${formatTokens(value)}`}
              />
            ))}
          </div>

          <div className="sf-mtable">
            {models.slice(0, NAMED_ROWS).map(([model, value], index) => (
              <div key={model} className="sf-mrow">
                <i className="sf-dot" style={{ background: laneColor(index) }} />
                <span className="sf-mname" title={model}>
                  {modelShort(model)}
                </span>
                <span className="sf-mtok">{formatTokens(value)}</span>
                <span className="sf-dim sf-pct">
                  {total > 0 ? Math.round((value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>

          {models.length > NAMED_ROWS && (
            <div className="sf-dim">+{models.length - NAMED_ROWS} more</div>
          )}
        </>
      )}
    </div>
  );
}
