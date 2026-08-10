import { scaleTime } from 'd3-scale';
import { mdhm } from '../../format.ts';

/* 時間軸の目盛り。**グラフをまたいで同じものを使う。**

   Tokens と Concurrency は同じ期間と同じ足を見ているので、目盛りが揃っていないと
   2 枚を重ねて読めない。刻みの置き場所は `d3-scale` が期間から決める —— 両端と真ん中に
   手で 3 つ置くと、幅を 30 分から 7 日まで動かしたときにどの幅でも中途半端な時刻が並ぶ。

   年は出さない。範囲はいちばん広くても 30 日で、年をまたぐ読み方をしない。 */

/** 置く目盛りの数。パネルは狭いので、これ以上置くと時刻が重なる */
const TICKS = 4;

/** これより端に寄った目盛りは、真ん中揃えをやめて内側へ寄せる。はみ出すと文字が切れる */
const EDGE_PERCENT = 6;

export function TimeTicks({ fromMs, toMs }: { fromMs: number; toMs: number }) {
  const axis = scaleTime().domain([fromMs, toMs]).range([0, 100]);

  return (
    <div className="sf-ticks">
      {axis.ticks(TICKS).map((at) => {
        const percent = axis(at);
        const shift =
          percent < EDGE_PERCENT ? '0' : percent > 100 - EDGE_PERCENT ? '-100%' : '-50%';
        return (
          <span
            key={at.getTime()}
            style={{ left: `${percent}%`, transform: `translateX(${shift})` }}
          >
            {mdhm(at.getTime())}
          </span>
        );
      })}
    </div>
  );
}
