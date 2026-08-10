/* 新しく動いたものから並べる。

   ユーザーが最初に見たいのは、いま動いているものである。だから木のどの深さでも
   向きは同じで、新しいほど前に来る。

   **受け取った並びは壊さない。** コピーを作ってから並べ替えるので、呼ぶ側が
   同じ配列を別の見方でもう一度使える。値が同じものは元の順のまま残る。 */

/** セッションと、そのサブエージェントを並べる。どちらも自分と子のうち最も新しい書き込みで測る */
export function sortByLastActivityDesc<T extends { readonly lastActivityMs: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

/** プロジェクトを並べる。プロジェクトは中のセッションのうち最も新しいもので測る */
export function sortByLatestActivityDesc<T extends { readonly latestActivityMs: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => b.latestActivityMs - a.latestActivityMs);
}
