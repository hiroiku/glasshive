/* プラットフォームの違い。**判定するのは一か所だけにする** — 効かせる側と見せる側で別々に判定すると、
   ⌘ と書いてあるのに Ctrl でしか動かない日が来る。 */

export const isApple = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
