import { useMemo } from 'react';
import { formatDuration, mdhms } from '../../format.ts';
import { pulseDelay } from '../../phase.ts';
import { type Axis, intervalsOf, type TimelineNode } from '../../timeline/axis.ts';

/* 行 1 本ぶんの稼働区間のバー。

   区間ごとに分けて描くのは、**動いていた時間と、待っていた時間を混ぜないため**である。
   1 本の長いバーにすると、10 分動いて 3 時間待ったセッションが「3 時間 10 分働いた」ように見える。

   表示範囲の外の区間は端に吸着させず、描かない。吸着させると位置も長さも嘘になる。
   表示範囲を跨ぐ区間は端で切るが、ホバー時に出す時刻は切る前の本当の値にする。 */

/** 一瞬で終わった区間も見えるように保つ最小の幅(%) */
const MIN_BAR_PCT = 0.6;

export function TlBar({
  node,
  axis,
  intervalsComplete,
  nowMs,
  onPanStart,
}: {
  node: TimelineNode;
  axis: Axis;
  /** 区間が `transcript` の先頭まで届いているか。届いていない手前は「密度不明」の細線で示す */
  intervalsComplete: boolean;
  nowMs: number;
  onPanStart: (event: React.MouseEvent) => void;
}) {
  const delay = useMemo(() => pulseDelay(Date.now()), []);
  const span = axis.t1 - axis.t0;
  const pct = (at: number) => ((at - axis.t0) / span) * 100;

  const intervals = intervalsOf(node, nowMs);
  const firstStart = intervals[0]?.[0] ?? axis.t0;
  /* 有界の読み取りで届かなかった、より古い区間。**在ったことは確かで、密度だけが
     分からない。** 何も描かないと「その頃は静かだった」に見えるので、細線で在ったこと
     だけを示す。 */
  const unknownEnd = intervalsComplete || intervals.length === 0 ? null : firstStart;
  const startedMs = Date.parse(node.started ?? node.last_activity) || axis.t0;

  /* 稼働を観測できなかった行。**棒では描かない。** 読めなかったことを続いた 1 本の稼働に
     すると、観測ゼロから所要時間を主張することになる。起点から最後の動きまでを細線で示して、
     その間に `transcript` が在ったことだけを言う。 */
  const unreadable = node.intervals_state === 'unobservable' && intervals.length === 0;
  const endedMs = Date.parse(node.last_activity) || startedMs;
  /** 起点を表示範囲の左端で切ったところ。細線はどちらもここから始まる */
  const startEdge = Math.max(startedMs, axis.t0);
  const unreadTo = Math.min(Math.max(endedMs, startedMs), axis.t1);

  const last = intervals.length - 1;
  const bars = intervals
    .map(([from, to], index) => ({
      from: Math.max(from, axis.t0),
      to: Math.min(to, axis.t1),
      // ホバー時に出すのは切る前の本当の時刻
      trueFrom: from,
      trueTo: to,
      isLast: index === last,
    }))
    .filter((bar) => bar.to >= bar.from && bar.to >= axis.t0 && bar.from <= axis.t1);

  const unknownTo = unknownEnd === null ? 0 : Math.min(unknownEnd, axis.t1);

  return (
    /* バーを掴んで表示範囲を横へ送るのはショートカットで、同じことはスライダーと期間のチップでもできる。
       この面は表の 11 番目のセルでもある — ラッパーを挟めないので、役はここが持つ */
    // biome-ignore lint/a11y/useSemanticElements: subgrid で列を揃えるので td を置けない
    // biome-ignore lint/a11y/useFocusableInteractive: セルは行ごと辿る。1 つずつのタブ順は作らない
    <span
      className="tl"
      role="gridcell"
      title={`${node.started ?? ''} → ${node.last_activity}`}
      onMouseDown={onPanStart}
    >
      {unreadable && startEdge <= unreadTo && (
        <i
          className="bar unknown"
          title={`${mdhms(startedMs)} → ${mdhms(endedMs)} · activity could not be read`}
          style={{
            left: `${pct(startEdge)}%`,
            width: `${Math.max(0.3, pct(unreadTo) - pct(startEdge))}%`,
          }}
        />
      )}
      {unknownEnd !== null && startEdge < unknownTo && (
        <i
          className="bar unknown"
          title={`${mdhms(startedMs)} → ${mdhms(unknownEnd)} · earlier activity (density unknown — beyond bounded scan)`}
          style={{
            left: `${pct(startEdge)}%`,
            width: `${Math.max(0.3, pct(unknownTo) - pct(startEdge))}%`,
          }}
        />
      )}
      {bars.map((bar) => {
        const left = Math.min(pct(bar.from), 100 - MIN_BAR_PCT);
        const width = Math.min(100 - left, Math.max(MIN_BAR_PCT, pct(bar.to) - left));
        // 明滅させるのは、いままさに動いている最後の区間だけ
        const live = node.state === 'active' && bar.isLast;
        return (
          <i
            key={`${bar.trueFrom}-${bar.trueTo}`}
            className={`bar ${node.state}${live ? '' : ' past'}`}
            title={`${mdhms(bar.trueFrom)} → ${live ? 'now' : mdhms(bar.trueTo)} · ${formatDuration(bar.trueTo - bar.trueFrom)}${live ? ' · live' : ''}`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              animationDelay: delay,
            }}
          />
        );
      })}
    </span>
  );
}
