import path from 'node:path';

/* パスどうしの重なりを見る。ここは文字列の話だけで、ディスクには触らない。

   `node:path` を使っているのは、これがファイルを読むライブラリではなく、
   区切り文字の決まりを知っているだけの計算だからである。

   どの bounded context にも属さない。ここに在るのは区切りの話だけで、業務の言葉は 1 つも無い。 */

/** パスとして使える文字列か。ここを通らないものは、以降どこへも渡さない */
export function isSafeAbsolutePath(value: string): boolean {
  if (value === '') return false;
  if (value.includes('\0')) return false;
  return path.isAbsolute(value);
}

/* root が candidate を含むか。

   **単なる前方一致では足りない。** `/a/b` で始まるかを見るだけだと、`/a/bc` まで
   「中にある」ことになる — 別のプロジェクトの中身が、隣のプロジェクトの名前で読めてしまう。
   区切り文字まで込みで見るのはそのためである。 */
export function containsPath(root: string, candidate: string): boolean {
  if (root === '' || candidate === '') return false;
  const r = path.normalize(root);
  const c = path.normalize(candidate);
  if (r === c) return true;
  return c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/* パスの深さ。区切り文字で割った、空でない要素の数。

   **`containsPath` と同じ読み方をしなければならない。** 含むかどうかを正規化したパスで
   見ておいて、深さを正規化前のパスで数えると、`/a/x/../b`(実は深さ 2)が `/a/b/c`
   (深さ 3)より深いことになり、より浅いほうが勝ってしまう。
   だから同じファイルに置いて、同じ正規化をする。 */
export function pathDepth(value: string): number {
  if (value === '') return 0;
  return path.normalize(value).split(path.sep).filter(Boolean).length;
}

/** パスの末尾の要素(ベース名) */
export function pathBasename(value: string): string {
  if (value === '') return '';
  return path.basename(path.normalize(value));
}
