import { queryOptions } from '@tanstack/react-query';
import { getPreferences } from '../functions/preferences.ts';

/* `preferences.json` の問い合わせ。

   木と違って、これは時とともに勝手に変わるものではない。変えるのはユーザーだけなので、
   変更通知で捨てる必要が無く、書き込んだときに自分で入れ替える。 */

export const preferencesQueryKey = ['preferences'] as const;

export const preferencesQuery = queryOptions({
  queryKey: preferencesQueryKey,
  queryFn: () => getPreferences(),
  staleTime: Number.POSITIVE_INFINITY,
});
