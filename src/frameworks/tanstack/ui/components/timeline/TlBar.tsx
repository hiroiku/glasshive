import { useMemo } from 'react';
import { formatDuration, mdhms } from '../../format.ts';
import { pulseDelay } from '../../phase.ts';
import { type Axis, intervalsOf, type TimelineNode } from '../../timeline/axis.ts';

/* 行 1 本ぶんの帯。

   帯を区間ごとに分けるのは、**動いていた時間と、待っていた時間を混ぜないため**である。
   1 本の長い帯にすると、10 分動いて 3 時間待ったセッションが「3 時間 10 分働いた」ように見える。

   **窓の外の区間は端に吸着させず、描かない。** 吸着させると位置も長さも嘘になる。
   窓を跨ぐ区間は端で切るが、載せたときに出す時刻は切る前の本当の値にする。 */

/** 点のような出来事も見えるように保つ最小の幅(%) */
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
  /** 帯が正本の先頭まで届いているか。届いていない手前は「濃さ不明」の細線で示す */
  intervalsComplete: boolean;
  nowMs: number;
  onPanStart: (event: React.MouseEvent) => void;
}) {
  const delay = useMemo(() => pulseDelay(Date.now()), []);
  const span = axis.t1 - axis.t0;
  const pct = (at: number) => ((at - axis.t0) / span) * 100;

  const intervals = intervalsOf(node, nowMs);
  const firstStart = intervals[0]?.[0] ?? axis.t0;
  /* 有界の走査で届かなかった昔の区間。**在ったことは確かで、濃さだけが分からない。**
     何も描かないと「その頃は静かだった」に見えるので、細線で在ったことだけを示す。 */
  const unknownEnd = intervalsComplete || intervals.length === 0 ? null : firstStart;
  const startedMs = Date.parse(node.started ?? node.last_activity) || axis.t0;

  const last = intervals.length - 1;
  const bars = intervals
    .map(([from, to], index) => ({
      from: Math.max(from, axis.t0),
      to: Math.min(to, axis.t1),
      // 載せたときに出すのは切る前の本当の時刻
      trueFrom: from,
      trueTo: to,
      isLast: index === last,
    }))
    .filter((bar) => bar.to >= bar.from && bar.to >= axis.t0 && bar.from <= axis.t1);

  const unknownFrom = Math.max(startedMs, axis.t0);
  const unknownTo = unknownEnd === null ? 0 : Math.min(unknownEnd, axis.t1);

  return (
    /* 帯を掴んで窓を横へ送るのは近道で、同じことは下の摘みと期間の札からできる */
    // biome-ignore lint/a11y/noStaticElementInteractions: 掴んで動かすためだけの面
    <span
      className="tl"
      title={`${node.started ?? ''} → ${node.last_activity}`}
      onMouseDown={onPanStart}
    >
      {unknownEnd !== null && unknownFrom < unknownTo && (
        <i
          className="bar unknown"
          title={`${mdhms(startedMs)} → ${mdhms(unknownEnd)} · これより前にも動いていた(濃さは不明 — 走査の外)`}
          style={{
            left: `${pct(unknownFrom)}%`,
            width: `${Math.max(0.3, pct(unknownTo) - pct(unknownFrom))}%`,
          }}
        />
      )}
      {bars.map((bar) => {
        const left = Math.min(pct(bar.from), 100 - MIN_BAR_PCT);
        const width = Math.min(100 - left, Math.max(MIN_BAR_PCT, pct(bar.to) - left));
        // 呼吸するのは、いままさに動いている最後の区間だけ
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
