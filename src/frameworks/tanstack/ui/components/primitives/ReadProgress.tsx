import { useEffect, useState } from 'react';

/* 読んでいる最中の表示。

   **割合を出さない。** いまのところ、どの画面も 1 往復で結果を受け取っていて、途中の状態が
   クライアントから見えない。分母を持たないままバーを塗ると、その幅は観測した量ではなく
   見た目のための数になる。塗る要素そのものを持たないので、幅を捏造する余地が無い。

   `.dot.unknown` が状態を塗らずに場所だけ取るのと同じ考えである。 */

/** ここを過ぎても終わらなければ、待たせていることに触れる */
const SLOW_MS = 8000;

interface ReadProgressProps {
  /** いま何を読んでいるか */
  readonly label: string;
  /** 長くかかっているときに足す 1 行。渡さなければ何も出さない */
  readonly slowNote?: string;
}

export function ReadProgress({ label, slowNote }: ReadProgressProps) {
  const [slow, setSlow] = useState(false);

  /* 遅いという判断は時間が経ってからしかできない。最初から出すと、速いときにも
     「遅い」と言うことになる。 */
  useEffect(() => {
    if (slowNote === undefined) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [slowNote]);

  return (
    <div className="rp">
      {/* 幅も割合も持たないので `aria-valuenow` を添えない。読み上げは「処理中」に留まる */}
      <div className="rp-track" role="progressbar" aria-label={label} />
      <p className="rp-label">{label}</p>
      {slow && slowNote !== undefined && <p className="rp-note">{slowNote}</p>}
    </div>
  );
}
