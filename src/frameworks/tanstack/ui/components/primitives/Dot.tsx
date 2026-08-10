import { useMemo } from 'react';
import { pulseDelay } from '../../phase.ts';

/* 状態を表す点。

   明滅の位相を決めるのはマウント時の一度だけ。再描画のたびに決め直すと、
   同じ状態の点どうしで明滅がずれていく。 */
export function Dot({ state }: { state: string }) {
  const delay = useMemo(() => pulseDelay(Date.now()), []);
  return <span className={`dot ${state}`} style={{ animationDelay: delay }} />;
}
