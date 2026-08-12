import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

/* 画素を数える構成の下ごしらえ。

   **描いたものを片付ける。** `ui` の側と違って、ここは 1 つのページを撮り続けるので、
   前のテストが残した行が下に積み上がっていく。積むだけなら測りは変わらないが、
   `document` から引く 1 行が書いた覚えの無い行になる。

   フォントも待つ。列の幅は文字の寸法で決まるので、差し替わった瞬間に測ると、撮った
   2 枚の大きさが違うという別の話になる。 */

beforeAll(async () => {
  await document.fonts.ready;
});

afterEach(() => {
  cleanup();
});
