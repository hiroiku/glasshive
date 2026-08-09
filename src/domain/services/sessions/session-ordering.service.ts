/* 新しく動いたものから並べる。

   観る人が最初に見たいのは、いま動いているものである。だから木のどの段でも
   向きは同じで、新しいほど前に来る。

   **受け取った並びは壊さない。** 写しを作ってから並べ替えるので、呼ぶ側が
   同じ配列を別の見方でもう一度使える。値が同じものは元の順のまま残る。 */

/** セッションと、その子を並べる。どちらも自分と子のうち最も新しい書き込みで測る */
export function sortByLastActivityDesc<T extends { readonly lastActivityMs: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

/** 巣を並べる。巣は中のセッションのうち最も新しいもので測る */
export function sortByLatestActivityDesc<T extends { readonly latestActivityMs: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => b.latestActivityMs - a.latestActivityMs);
}
