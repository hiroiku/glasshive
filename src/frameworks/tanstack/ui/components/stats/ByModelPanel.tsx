import { formatTokens, modelShort } from '../../format.ts';
import { laneColor } from '../../palette.ts';

/* どのモデルがどれだけ使ったか。

   表として列を揃えるのは、行ごとに並べると桁がずれて比べられなくなるからである。
   `.sf-mrow` は `display: contents` で親の列へ直に流し込む — **包みを増やさない。** */

/** 名前を出す上限。それより下は数だけ添える */
const NAMED_ROWS = 4;

export function ByModelPanel({
  models,
  total,
}: {
  readonly models: readonly (readonly [string, number])[];
  readonly total: number;
}) {
  return (
    <div className="sf-panel sf-models">
      <div className="sf-h">
        <span className="sf-title">By model</span>
      </div>

      {models.length === 0 ? (
        <div className="sf-dim">no usage in range</div>
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
