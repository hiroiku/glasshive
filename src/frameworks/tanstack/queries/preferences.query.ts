import { queryOptions } from '@tanstack/react-query';
import { getPreferences } from '../functions/preferences.ts';

/* 選びの問い合わせ。

   木と違って、これは時とともに勝手に変わるものではない。変えるのは観る人だけなので、
   合図で捨てる必要が無く、置いたときに自分で入れ替える。 */

export const preferencesQueryKey = ['preferences'] as const;

export const preferencesQuery = queryOptions({
  queryKey: preferencesQueryKey,
  queryFn: () => getPreferences(),
  staleTime: Number.POSITIVE_INFINITY,
});
