import { useMemo } from 'react';
import { pulseDelay } from '../../phase.ts';

/* 様子を表す点。

   位相を作るのは現れたとき一度だけ。描き直すたびに引き直すと、
   同じ様子の点どうしで明滅がずれていく。 */
export function Dot({ state }: { state: string }) {
  const delay = useMemo(() => pulseDelay(Date.now()), []);
  return <span className={`dot ${state}`} style={{ animationDelay: delay }} />;
}
