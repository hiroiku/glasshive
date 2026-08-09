/* 盤の違い。**判じるのは一か所だけにする** — 効かせる側と見せる側で別々に判じると、
   ⌘ と書いてあるのに Ctrl でしか動かない日が来る。 */

export const isApple = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
