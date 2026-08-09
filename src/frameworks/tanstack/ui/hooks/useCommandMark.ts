import { isApple } from '../platform.ts';
import { useHydrated } from './useHydrated.ts';

/* 押す鍵の名。札に出す字そのもの。

   **組み立てのときには分からない。** 器は先に組んで配るので、そのときの盤は
   配る側の盤である。最初は誰の盤でも同じ字を出しておき、載ってから言い直す。 */

const OTHERS = 'Ctrl+';

export function useCommandMark(): string {
  return useHydrated() && isApple() ? '⌘' : OTHERS;
}
