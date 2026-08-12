import { page } from 'vitest/browser';

/* 規則が実際に何を塗ったかを読む。

   **`getComputedStyle` では足りない。** 宣言が解決していることと、その宣言が画面に何かを
   残すことは別である。`mask-image` に消された `::after` は `display: block` のまま
   `width: 2px` と答え、DOM を見るテストからは在るものとして見える。

   だから塗った後と塗る前を撮って、変わった画素を数える。

   どこを撮るかは呼ぶ側が決める。自分の箱の外へ出る擬似要素が在るので、たいていは要素を
   載せているトラックを撮る —— 要素の箱だけを撮ると、外へ出たぶんが画面から消えても差が
   出ない。逆に、箱の外に在るものを測りから外したいときは、要素そのものを撮る。 */

/** 画素 1 つが「変わった」とみなす差。JPEG ではないので、本来は 0 か大きな差しか出ない */
const CHANNEL_NOISE = 2;

export interface Painted {
  /** 塗る前と変わった画素の数 */
  readonly pixels: number;
  /** いちばん大きかったチャンネルの差。薄すぎて見えないものと、消えているものを分ける */
  readonly strongest: number;
  /* 変わった量の総和。**数だけでは足りない** —— 薄く残っただけの規則も、はっきり塗った
     規則も、同じ画素数を返すことが在る。濃さまで落ちたことは、ここにしか出ない。 */
  readonly ink: number;
}

/* 撮った PNG を画素へ開く。デコーダはブラウザーが持っているものを使う ——
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

/* 撮った 2 枚のうち、`only` の箱に当たるところだけを見る。

   **隠した要素そのものは撮れない。** ブラウザーは見えない要素の撮影を待ち続けるので、
   狭いところを見たいときも撮るのは載せている側で、切り出しはこちらでやる。 */
function region(within: Element, only: Element | undefined): DOMRect | null {
  if (only === undefined) return null;
  const frame = within.getBoundingClientRect();
  const box = only.getBoundingClientRect();
  return new DOMRect(box.x - frame.x, box.y - frame.y, box.width, box.height);
}

function compare(before: ImageData, after: ImageData, only: DOMRect | null): Painted {
  if (before.data.length !== after.data.length) {
    throw new Error('撮った 2 枚の大きさが違う。測っている間にレイアウトが動いている');
  }
  const fromX = only === null ? 0 : Math.floor(only.x);
  const toX = only === null ? before.width : Math.ceil(only.x + only.width);
  const fromY = only === null ? 0 : Math.floor(only.y);
  const toY = only === null ? before.height : Math.ceil(only.y + only.height);
  let pixels = 0;
  let strongest = 0;
  let ink = 0;
  for (let y = Math.max(0, fromY); y < Math.min(before.height, toY); y++) {
    for (let x = Math.max(0, fromX); x < Math.min(before.width, toX); x++) {
      const at = (y * before.width + x) * 4;
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
  }
  return { pixels, strongest, ink };
}

/* `element` が `within` の中に残したものを数える。

   隠すのに `visibility` を使う。**`display: none` にはしない** —— 絶対配置でない要素なら
   レイアウトが動き、2 枚の絵が別のものになる。`visibility` は自分と子孫と擬似要素だけを
   消して、箱はその場に残す。 */
export async function paintedBy(
  element: HTMLElement,
  within: Element,
  only?: Element,
): Promise<Painted> {
  const had = element.style.visibility;
  const box = region(within, only);
  element.style.visibility = 'hidden';
  try {
    const before = await pixelsOf(within);
    element.style.visibility = had;
    const after = await pixelsOf(within);
    return compare(before, after, box);
  } finally {
    element.style.visibility = had;
  }
}

/* 2 つの状態が別の絵になっているかを見る。**同じ絵なら、片方の言っていることが届いていない。**
   `mutate` を当てた後の絵と、当てる前の絵を比べる。 */
export async function differsAfter(
  within: Element,
  mutate: () => void,
  undo: () => void,
): Promise<Painted> {
  const before = await pixelsOf(within);
  try {
    mutate();
    const after = await pixelsOf(within);
    return compare(before, after, null);
  } finally {
    undo();
  }
}

/* 測りの邪魔になる規則を、そのテストの間だけ止める。

   **強い隣人が測りを飲み込むことが在る。** 読み残しのハッチは薄く、同じ要素の `::after`
   が引く切れ目の線は濃いので、要素ごと測るとインクの 9 割を線が出す —— ハッチを丸ごと
   消しても、その測りは 1 割しか動かない。線は線で別に測ってあるので、ハッチを見るあいだは
   止めておく。 */
export function suppress(css: string): () => void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  return () => style.remove();
}
