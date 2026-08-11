import { useRef, useState } from 'react';
import { absTime } from '../../format.ts';
import { parseTimeInput } from '../../timeline/axis.ts';

/* 時間帯を選ぶ。両端のハンドルで端を動かし、選択範囲のバーそのものを掴めば
   表示範囲ごと動かせる。

   汎用の時間範囲なので、表とは分けてある。表の側は「いまどの範囲を見ているか」を
   持っているだけで、その範囲をどう動かすかはここが全部持つ。 */

/** これより狭い表示範囲は作らない。1 分未満の軸には目盛りが置けない */
const MIN_SPAN_MS = 60_000;

/** PageUp / PageDown と Shift を添えた矢印が、一度に送る刻みの数 */
const PAGE_STEPS = 10;

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
    // 掴んだのはハンドルであって、その下にある選択範囲のバーではない
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
        // 端に当たったら幅を保ったまま止める。潰すと表示範囲の広さが勝手に変わる
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

  /* キーボードでは 1 押しずつ動かす。刻み幅は表示範囲の広さに合わせる —
     固定の秒数で刻むと、広い範囲では何度押しても動いたように見えない。

     Home と End はその端が取れる限界まで一息で送る。**マウスはトラックの端まで
     ドラッグすれば届く。** キーボードだけに行き先が無いと、広い範囲では端に着く前に
     何十回も押すことになる。 */
  const step = Math.max(MIN_SPAN_MS, (b - a) / 20);
  const nudge = (edge: 'a' | 'b') => (event: React.KeyboardEvent) => {
    // 行き先は端どうしの最小の幅で丸める。どちらの端も相手を追い越さない
    const put = (at: number) => {
      if (edge === 'a') onChange(Math.max(min, Math.min(at, b - MIN_SPAN_MS)), b);
      else onChange(a, Math.min(max, Math.max(at, a + MIN_SPAN_MS)));
    };
    const at = edge === 'a' ? a : b;
    const wide = step * PAGE_STEPS;
    switch (event.key) {
      case 'ArrowLeft':
        put(at - (event.shiftKey ? wide : step));
        break;
      case 'ArrowRight':
        put(at + (event.shiftKey ? wide : step));
        break;
      case 'PageDown':
        put(at - wide);
        break;
      case 'PageUp':
        put(at + wide);
        break;
      // 端の行き先は `aria-valuemin` / `aria-valuemax` が名乗っているものと同じにする
      case 'Home':
        put(edge === 'a' ? min : a);
        break;
      case 'End':
        put(edge === 'a' ? b : max);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className="rslider" ref={trackRef} title={`${absTime(a)} – ${absTime(b)}`}>
      <div className="rs-track" />
      {/* バーを掴むのは表示範囲ごと動かすためのショートカットで、同じことは両端のハンドルでもできる */}
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

/* ただの表示に見えて、触ると書き換えられる日時。

   下書きを別に持つのは、入力途中の文字列を軸に反映させないためである。
   1 文字打つたびに軸が動くと、打ち終わる前に表示範囲が飛んでいく。

   名前は呼ぶ側が渡す。**同じ形をした欄が 2 つ並ぶ。** 書式を名前にすると、
   どちらが表示範囲の始まりでどちらが終わりなのかが読み上げから消える。 */
export function TimeInput({
  value,
  label,
  onCommit,
}: {
  value: number;
  /** 読み上げに出す名前 */
  label: string;
  onCommit: (atMs: number) => void;
}) {
  // null = 書き換えていない(今の値を映す)
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  return (
    <input
      className="rs-time"
      aria-label={`${label} (YYYY-MM-DD HH:MM)`}
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
        // パースできない文字列は捨てて今の値へ戻す。当てずっぽうの時刻へ飛ばさない
        if (at !== null) onCommit(at);
      }}
    />
  );
}
