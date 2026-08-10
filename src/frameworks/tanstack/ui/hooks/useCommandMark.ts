import { isApple } from '../platform.ts';
import { useHydrated } from './useHydrated.ts';

/* 押すキーの名前。ラベルに出す文字そのもの。

   **ビルドのときには分からない。** HTML シェルは先に組んで配るので、そのとき分かるのは
   配る側の OS だけである。最初はどの OS でも同じ文字を出しておき、ハイドレートしてから
   言い直す。 */

const OTHERS = 'Ctrl+';

export function useCommandMark(): string {
  return useHydrated() && isApple() ? '⌘' : OTHERS;
}
