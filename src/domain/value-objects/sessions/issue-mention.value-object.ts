/* 何の課題に取り組んでいるか。

   作業領域の場所(`.worktrees/<名前>`)が正本に出てくれば、その名前が取り組んでいる課題である。
   これも決まった欄ではないので、字面から拾う。

   上限が二段あるのは、拾う側と載せる側で目的が違うためである。拾う側は走査を短く
   切り上げるために `MAX_MENTIONS` で止め、載せる側は画面の一行に収めるために
   `MAX_SESSION_ISSUES` まで削る。 */

const WORKTREE = /\.worktrees\/([A-Za-z0-9._-]+)/g;

/** 一度の走査で拾う数の上限 */
export const MAX_MENTIONS = 8;

/** セッション 1 つが持つ数の上限 */
export const MAX_SESSION_ISSUES = 5;

export function scanWorktreeMentions(text: string, max: number = MAX_MENTIONS): string[] {
  const found: string[] = [];
  for (const matched of text.matchAll(WORKTREE)) {
    // 末尾の点は区切りとして書かれたものなので落とす(`.worktrees/foo.` の `.`)
    const token = (matched[1] ?? '').replace(/\.+$/, '');
    if (token === '' || found.includes(token)) continue;
    found.push(token);
    if (found.length >= max) break;
  }
  return found;
}
