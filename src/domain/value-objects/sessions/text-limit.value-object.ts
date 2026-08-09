/* 導き出した言葉の長さ。

   題も「いま何をしているか」も、正本の一行をそのまま持つのではなく、決まった長さに
   切り詰めたものが値の定義である。画面の都合ではないので、切り詰めはここで起きる。

   数えるのは **符号位置**([...s] で分ける)。UTF-16 の長さで切ると、絵文字のような
   2 単位で 1 字を成すものが割れて、壊れた字が出る。
   結合子で繋いだ並び(👩‍💻 など)は複数の符号位置なので、そこでは割れ得る。 */

/** 題の長さ */
export const TITLE_MAX_CHARS = 60;

/** 「いま何をしているか」の長さ */
export const CURRENT_MAX_CHARS = 90;

/** 切り詰めたことを示す字 */
export const ELLIPSIS = '…';

export function truncateChars(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join('') + ELLIPSIS : text;
}
