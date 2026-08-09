import { useRef, useState } from 'react';
import { absTime } from '../../format.ts';
import { parseTimeInput } from '../../timeline/axis.ts';

/* 時間帯を選ぶ。両端の摘みで端を、帯そのものを掴んで窓ごと動かす。

   汎用の時間の範囲なので、表とは分けてある。表の側は「いまどの窓を見ているか」を
   持っているだけで、その窓をどう動かすかはここが全部持つ。 */

/** これより狭い窓は作らない。1 分未満の軸には目盛りが置けない */
const MIN_SPAN_MS = 60_000;

export function RangeSlider({
  min,
  max,
  a,
  b,
  onChange,
}: {
  min: number;
  max: number;
  a: number;
  b: number;
  onChange: (a: number, b: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pct = (at: number) => Math.min(100, Math.max(0, ((at - min) / (max - min)) * 100));
  const fromX = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect();
    if (box === undefined) return min;
    return min + Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * (max - min);
  };

  const start = (mode: 'a' | 'b' | 'pan') => (event: React.MouseEvent) => {
    event.preventDefault();
    // 掴んだのは摘みであって、下にある帯ではない
    event.stopPropagation();
    const x0 = event.clientX;
    const a0 = a;
    const b0 = b;

    const move = (moved: MouseEvent) => {
      if (mode === 'pan') {
        const delta = fromX(moved.clientX) - fromX(x0);
        const width = b0 - a0;
        let na = a0 + delta;
        let nb = b0 + delta;
        // 端に当たったら幅を保ったまま止める。潰すと窓の広さが勝手に変わる
        if (na < min) {
          na = min;
          nb = min + width;
        }
        if (nb > max) {
          nb = max;
          na = max - width;
        }
        onChange(na, nb);
      } else if (mode === 'a') {
        onChange(Math.min(fromX(moved.clientX), b - MIN_SPAN_MS), b);
      } else {
        onChange(a, Math.max(fromX(moved.clientX), a + MIN_SPAN_MS));
      }
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  /* 鍵盤では 1 押しずつ動かす。刻みは窓の広さに合わせる —
     絶対の秒で刻むと、広い窓では何度押しても動いたように見えない。 */
  const step = Math.max(MIN_SPAN_MS, (b - a) / 20);
  const nudge = (edge: 'a' | 'b') => (event: React.KeyboardEvent) => {
    const way = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (way === 0) return;
    event.preventDefault();
    const wide = event.shiftKey ? 10 : 1;
    if (edge === 'a') {
      onChange(Math.max(min, Math.min(a + way * step * wide, b - MIN_SPAN_MS)), b);
      return;
    }
    onChange(a, Math.min(max, Math.max(b + way * step * wide, a + MIN_SPAN_MS)));
  };

  return (
    <div className="rslider" ref={trackRef} title={`${absTime(a)} – ${absTime(b)}`}>
      <div className="rs-track" />
      {/* 帯そのものを掴むのは窓ごと動かすためだけの近道で、同じことは両端の摘みでできる */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 掴んで動かすためだけの面 */}
      <div
        className="rs-fill"
        style={{
          left: `${pct(a)}%`,
          width: `${Math.max(0.5, pct(b) - pct(a))}%`,
        }}
        onMouseDown={start('pan')}
      />
      <div
        className="rs-handle"
        style={{ left: `${pct(a)}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Window start"
        aria-valuemin={min}
        aria-valuemax={b}
        aria-valuenow={a}
        aria-valuetext={absTime(a)}
        onMouseDown={start('a')}
        onKeyDown={nudge('a')}
      />
      <div
        className="rs-handle"
        style={{ left: `${pct(b)}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Window end"
        aria-valuemin={a}
        aria-valuemax={max}
        aria-valuenow={b}
        aria-valuetext={absTime(b)}
        onMouseDown={start('b')}
        onKeyDown={nudge('b')}
      />
    </div>
  );
}

/* 素の表示に見えて、触ると書き換えられる日付。

   下書きを別に持つのは、打っている途中の字を軸に反映させないためである。
   1 字打つたびに軸が動くと、打ち終わる前に窓が飛んでいく。 */
export function TimeInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (atMs: number) => void;
}) {
  // null = 書き換えていない(今の値を映す)
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  return (
    <input
      className="rs-time"
      title="YYYY-MM-DD HH:MM"
      value={draft ?? absTime(value)}
      onFocus={(event) => {
        setDraft(absTime(value));
        event.target.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        else if (event.key === 'Escape') {
          cancelledRef.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setDraft(null);
          return;
        }
        if (draft === null) return;
        const at = parseTimeInput(draft, value);
        setDraft(null);
        // 読めない字は捨てて今の値へ戻す。当てずっぽうの時刻へ飛ばさない
        if (at !== null) onCommit(at);
      }}
    />
  );
}
