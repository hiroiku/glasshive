import type { Observation } from '~/app-kernel/observation.ts';

/* `transcript` を、バイトの位置でページに切って読むポート。

   **glasshive で唯一、純関数にできない読み方である。** 追記され続ける `transcript` を
   同じ場所から読み直せる鍵はバイトの位置しかなく、その位置は開いてみないと分からない。

   `reduce` を呼ぶ側から渡すのは、何を数えて打ち切るかが呼ぶ側の言葉だからである。
   実装は行を切り出してバイトを数えるだけで、切り出した行が何であるかを知らない。
   知らないまま「呼ぶ側にとって意味のあったものが `maxItems` 個できたら止める」と
   言えるので、上限の意味がパースする側とずれない。

   幅も上限も引数で受ける。値は domain が持っており、ここで持つと二か所に散る。 */

export interface TranscriptPageRequest {
  /** 読み始める位置。`null` なら末尾から `tailWindowBytes` だけ遡る */
  readonly from: number | null;
  /** ここで止める位置。`null` なら上限に当たるまで進む */
  readonly to: number | null;
  readonly tailWindowBytes: number;
  /** 一度に読み進むバイトの上限 */
  readonly maxChunkBytes: number;
  /** 一度に返す `items` の数の上限。**行の数ではなく、`reduce` が残した数** */
  readonly maxItems: number;
  /** 行の終わりを探して読み進む単位 */
  readonly readBlockBytes: number;
}

export interface TranscriptPage<T> {
  /** 実際に読み始めた位置。行の頭へ揃えた後の値 */
  readonly start: number;
  /* 次に読むべき位置。**書き込み途中の行はここに含めない。**
     含めると、その行が完成した後にもう一度読む手段が無くなる。 */
  readonly next: number;
  readonly eof: boolean;
  readonly size: number;
  readonly items: readonly T[];
}

export interface TranscriptEventsRepository {
  /** 1 ページぶん読む。`reduce` が `null` を返した行は `items` に入らないが、位置は進む */
  readPage<T>(
    file: string,
    request: TranscriptPageRequest,
    reduce: (line: string) => T | null,
  ): Promise<Observation<TranscriptPage<T>>>;
}
