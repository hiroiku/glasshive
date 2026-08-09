import path from 'node:path';

/* 場所どうしの重なりを見る。ここは文字の話だけで、ディスクには触らない。

   node:path を使っているのは、これがファイルを読む道具ではなく、区切りの決まりを
   知っているだけの計算だからである。

   どの境目にも属さない。ここに在るのは区切りの話だけで、業務の言葉は 1 つも無い。 */

/** 場所として使える名前か。ここを通らないものは、以降どこへも渡さない */
export function isSafeAbsolutePath(value: string): boolean {
  if (value === '') return false;
  if (value.includes('\0')) return false;
  return path.isAbsolute(value);
}

/* root が candidate を含むか。

   **単なる前方一致では足りない。** `/a/b` で始まるかを見るだけだと、`/a/bc` まで
   「中にある」ことになる — 別の巣の中身が、隣の巣の名前で読めてしまう。
   区切りまで込みで見るのはそのためである。 */
export function containsPath(root: string, candidate: string): boolean {
  if (root === '' || candidate === '') return false;
  const r = path.normalize(root);
  const c = path.normalize(candidate);
  if (r === c) return true;
  return c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/** どちらかがどちらかを含むか。一部から起動されることがあるので、向きは問わない */
export function overlapsPath(a: string, b: string): boolean {
  return containsPath(a, b) || containsPath(b, a);
}

/* 場所の深さ。区切りで割った、空でない名前の数。

   **containsPath と同じ読み方をしなければならない。** 含むかを畳んだ字面で見ておいて、
   深さを畳む前の字面で数えると、`/a/x/../b`(実は深さ 2)が `/a/b/c`(深さ 3)より
   深いことになり、より浅いほうが勝ってしまう。だから同じ場所に置いて、同じ畳み方をする。 */
export function pathDepth(value: string): number {
  if (value === '') return 0;
  return path.normalize(value).split(path.sep).filter(Boolean).length;
}

/** 場所の末尾の名前 */
export function pathBasename(value: string): string {
  if (value === '') return '';
  return path.basename(path.normalize(value));
}
