import { page } from 'vitest/browser';

/* 規則が実際に何を塗ったかを読む。

   **`getComputedStyle` では足りない。** 宣言が解決していることと、その宣言が画面に何かを
   残すことは別である。`mask-image` に消された `::after` は `display: block` のまま
   `width: 2px` と答え、DOM を見るテストからは在るものとして見える。

   だから塗った後と塗る前を撮って、変わった画素を数える。

   **どこを撮るかは呼ぶ側が決める。** `.gt-cut::after` のように自分の箱の外へ出る擬似要素が
   在るので、たいていは要素を載せているトラックを撮る —— 要素の箱だけを撮ると、外へ出た
   ぶんが画面から消えても差が出ない。逆に、箱の外に在るものを測りから外したいときは、
   要素そのものを撮る。 */

/** 画素 1 つが「変わった」とみなす差。JPEG ではないので、本来は 0 か大きな差しか出ない */
const CHANNEL_NOISE = 2;

export interface Painted {
  /** 塗る前と変わった画素の数 */
  readonly pixels: number;
  /** 撮った範囲の画素の数。割合を言うために持つ */
  readonly of: number;
  /** いちばん大きかったチャンネルの差。薄すぎて見えないものと、消えているものを分ける */
  readonly strongest: number;
  /* 変わった量の総和。**数だけでは足りない** —— 薄く残っただけの規則も、はっきり塗った
     規則も、同じ画素数を返すことが在る。濃さまで落ちたことは、ここにしか出ない。 */
  readonly ink: number;
}

/* 撮った PNG を画素へ開く。**デコーダはブラウザーが持っているものを使う** ——
   Node の側へ運んで解くと、PNG を解くライブラリを 1 つ増やすことになる。
   `save: false` で撮ると、ファイルには残さず base64 の文字列だけが返る。 */
async function pixelsOf(within: Element): Promise<ImageData> {
  const shot = await page.screenshot({ element: within, save: false });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('撮った画像を開けなかった'));
    image.src = `data:image/png;base64,${shot}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2d のコンテキストを取れなかった');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function compare(before: ImageData, after: ImageData): Painted {
  if (before.data.length !== after.data.length) {
    throw new Error('撮った 2 枚の大きさが違う。隠したことでレイアウトが動いている');
  }
  let pixels = 0;
  let strongest = 0;
  let ink = 0;
  for (let at = 0; at < before.data.length; at += 4) {
    let worst = 0;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(
        (before.data[at + channel] ?? 0) - (after.data[at + channel] ?? 0),
      );
      if (difference > worst) worst = difference;
    }
    if (worst > CHANNEL_NOISE) pixels++;
    if (worst > strongest) strongest = worst;
    ink += worst;
  }
  return { pixels, of: before.data.length / 4, strongest, ink };
}

/* `element` が `within` の中に残したものを数える。

   隠すのに `visibility` を使う。**`display: none` にはしない** —— 絶対配置でない要素なら
   レイアウトが動き、2 枚の絵が別のものになる。`visibility` は自分と子孫と擬似要素だけを
   消して、箱はその場に残す。 */
export async function paintedBy(element: HTMLElement, within: Element): Promise<Painted> {
  const had = element.style.visibility;
  element.style.visibility = 'hidden';
  const before = await pixelsOf(within);
  element.style.visibility = had;
  const after = await pixelsOf(within);
  return compare(before, after);
}

/* 2 つの状態が別の絵になっているかを見る。**同じ絵なら、片方の言っていることが届いていない。**
   `mutate` を当てた後の絵と、当てる前の絵を比べる。 */
export async function differsAfter(
  within: Element,
  mutate: () => void,
  undo: () => void,
): Promise<Painted> {
  const before = await pixelsOf(within);
  mutate();
  const after = await pixelsOf(within);
  undo();
  return compare(before, after);
}
