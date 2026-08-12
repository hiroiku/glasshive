import { queryOptions } from '@tanstack/react-query';
import { getTarget } from '../functions/target.ts';

/* 起動のときに名指されたディレクトリ。

   名指されたかどうかは走っているあいだ変わらないが、**そこに何が観測できるかは変わる**
   —— まだ `transcript` を 1 本も持たないリポジトリで Claude Code が動き出せば、同じ
   ディレクトリに読むものが増える。だから答えを永久に固めない。 */

export const targetQueryKey = ['target'] as const;

export const targetQuery = queryOptions({
  queryKey: targetQueryKey,
  queryFn: () => getTarget(),
});
