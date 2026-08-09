import { useEffect, useState } from 'react';

/* いまの時刻を、決めた間隔で進める。

   様子と稼働の帯は**合図が無くても変わる** — 待っているセッションは、待ち続けている
   だけで「30 分動きが無い」に変わり、動いている帯は現在まで伸び続ける。
   合図だけを待っていると、静かな画面がいつまでも古い時刻のまま止まる。

   1 枚の画面で 1 つだけ引くのは、行ごとに引き直すと同じ画面の中で
   「3 秒前」と「4 秒前」が混ざるからである。 */

export function useNowMs(intervalMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return nowMs;
}
