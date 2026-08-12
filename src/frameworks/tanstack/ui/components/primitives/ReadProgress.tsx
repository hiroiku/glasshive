import { useEffect, useState } from 'react';

/* 読んでいる最中の表示。

   **割合は、分母まで観測できているときだけ塗る。** 1 往復で答えを受け取る画面には途中の
   状態が無く、そこで塗るバーの幅は観測した量ではなく見た目のための数になる。塗るときは
   `rp-fill` という要素を足す —— 塗る要素が在るかどうかが、分母を観測できたかどうかを表す。

   塗るのは読み取りの進み具合であって、一覧が何割できたかではない。12 MiB の `transcript`
   から 1 行しか出ないことも在るので、この 2 つは合わない。だから `scan` は何を数えているかを
   自分で言い、読み上げにもその言葉のほうを渡す —— 裸の「6%」は、何の 6% なのかを言わない。

   `.dot.unknown` が状態を塗らずに場所だけ取るのと同じ考えである。 */

/** ここを過ぎても終わらなければ、待たせていることに触れる */
const SLOW_MS = 8000;

/** 観測した進み具合。**分母まで観測できているときだけ渡す** */
export interface ReadScan {
  /** ここまでに読めた量 */
  readonly done: number;
  /** 読むと分かっている総量。0 を渡すと、まだ分母を観測できていないものとして塗らない */
  readonly total: number;
  /** 何を数えているかまで含む 1 行。`1.2 of 4.8 MiB read from this transcript` */
  readonly text: string;
}

interface ReadProgressProps {
  /** いま何を読んでいるか */
  readonly label: string;
  /** 長くかかっているときに足す 1 行。渡さなければ何も出さない */
  readonly slowNote?: string;
  /** 観測した進み具合。渡さないか、分母が無ければ、輪郭だけのバーになる */
  readonly scan?: ReadScan | null;
}

/* 塗る幅と、それに添える言葉。分母を観測できていなければ `null` —— 塗る幅も、読み上げに
   渡す割合も、そこからは出せない。

   総量を超えた読みは総量で止める。**分母は読んでいるあいだにも古くなる** —— `transcript`
   は追記され続けるので、取った大きさより先まで読めていることが在る。 */
function measure(scan: ReadScan | null | undefined): { pct: number; text: string } | null {
  if (scan === null || scan === undefined || !(scan.total > 0)) return null;
  return { pct: Math.min(100, Math.max(0, (scan.done / scan.total) * 100)), text: scan.text };
}

export function ReadProgress({ label, slowNote, scan }: ReadProgressProps) {
  const [slow, setSlow] = useState(false);

  /* 遅いという判断は時間が経ってからしかできない。最初から出すと、速いときにも
     「遅い」と言うことになる。 */
  useEffect(() => {
    if (slowNote === undefined) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [slowNote]);

  const measured = measure(scan);

  return (
    <div className="rp">
      {/* 幅を持たないバーには `aria-valuenow` を添えない。読み上げは「処理中」に留まる ——
          観測していない割合を、読み上げの側にだけ渡すことはできない。
          添えるときは `aria-valuetext` も一緒に渡す —— 裸の割合だけを渡すと、何を数えた
          割合なのかが読み上げからは分からない */}
      <div
        className={`rp-track${measured === null ? '' : ' measured'}`}
        role="progressbar"
        aria-label={label}
        {...(measured === null
          ? {}
          : {
              'aria-valuenow': Math.round(measured.pct),
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuetext': measured.text,
            })}
      >
        {measured !== null && <i className="rp-fill" style={{ width: `${measured.pct}%` }} />}
      </div>
      <p className="rp-label">{label}</p>
      {/* 何を数えているかは、割合を塗るときだけ言う。塗らないバーの下に数を置くと、
          その数がバーの幅を指しているように読める */}
      {measured !== null && <p className="rp-scan">{measured.text}</p>}
      {slow && slowNote !== undefined && <p className="rp-note">{slowNote}</p>}
    </div>
  );
}
