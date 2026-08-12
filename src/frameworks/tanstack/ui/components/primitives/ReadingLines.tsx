/* まだ届いていない中身の場所を、先に取っておく表示。

   **場所を取ることがこの表示の仕事である。** 何も置かずに待つと、届いた瞬間に下の中身が
   押し下げられて、読んでいた場所が飛ぶ。それ以上に、何も置かない待ちは「ここには何も無い」
   と読める —— まだ読んでいないことと、読んで無かったことを混ぜないのが glasshive の決まり
   なので、画面の側でそれを崩すわけにはいかない。

   取る場所は、届く中身と同じ高さではない。届くまで行数も 1 行の高さも分からないので、
   ここが置くのは呼ぶ側が見込んだ行数ぶんである。揃えられるのは高さではなく、そこに何かが
   来るという事実のほうである。

   `ReadProgress` とは形が違うだけで、言っていることは同じである。あちらは待ちのために場所を
   空けられるところに置き、こちらは中身が流れ込む場所そのものに置く。 */

export function ReadingLines({
  lines,
  label,
}: {
  /** 取っておく行の数。届く中身の見込みを渡す */
  readonly lines: number;
  /** 何を読んでいるか。読み上げにはこれだけが渡る */
  readonly label: string;
}) {
  return (
    /* `status` にはしない。**中身を持たない live region は、何も読み上げない** —— 空の行を
       置いているだけなので、読み上げに変化として渡るものが無い。割合を持たない
       `progressbar` は、そこへ辿り着いた人に、何を読んでいる最中かを名前で答える。
       割り込んで読み上げさせたいなら、文字を持つ `role="status"` が要る。 */
    <div className="rl" role="progressbar" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 位置しか持たない行で、identity は位置そのものである
        <span key={`l${index}`} className="rl-line" />
      ))}
    </div>
  );
}
