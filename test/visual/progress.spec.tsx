import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '~/frameworks/tanstack/ui/styles/index.css';
import { ReadingLines } from '~/frameworks/tanstack/ui/components/primitives/ReadingLines.tsx';
import { ReadProgress } from '~/frameworks/tanstack/ui/components/primitives/ReadProgress.tsx';
import { paintedBy, suppress } from './paint.ts';

/* 待っていることを言う規則が、実際に何を塗るか。

   ここに並ぶ規則も `Observation` の主張である —— 塗ったバーは「ここまで観測できた」、
   輪郭だけのバーは「どこまで進んだかは観測できていない」、場所を取る行は「ここに中身が来る」。
   **どれも、効かなくなると「ここには何も無い」に化ける。**

   `happy-dom` の側からは、`.rp-fill` が在ることと `width` が付いていることまでしか見えない。
   幅 0 に潰れていても、`::after` の光に覆われていても、そこは通ってしまう。 */

const box = () => {
  const host = document.createElement('div');
  /* 撮る相手を決めるために、幅の在る箱へ載せる。バーは自分で 220px を取るので、
     ここが決めるのは撮る範囲だけである。 */
  host.style.width = '400px';
  document.body.append(host);
  return host;
};

describe('読んでいる最中のバー', () => {
  /* 分母を観測できていないバーは、輪郭の中を光が走るだけである。**塗ってはいけない** ——
     塗った幅は読めた量として読まれるので、そこに在るのは観測していない数になる。 */
  it('分母を観測していないバーにも、走る光が在る', async () => {
    const host = box();
    const { container } = render(<ReadProgress label="Reading transcripts" />, { container: host });
    const track = container.querySelector('.rp-track') as HTMLElement;

    /* 輪郭の塗りと動きを、この測りのあいだだけ止める。輪郭は光が無くても塗るので、
       一緒に測ると `::after` を丸ごと外しても画素が減らない。動きを止めるのは、走り切った
       ところでは光が輪郭の外へ出ていて、撮る時刻しだいで写らないからである。 */
    const restore = suppress(
      '.rp-track { background: none !important } .rp-track::after { animation: none !important }',
    );
    try {
      const painted = await paintedBy(track, host);

      expect(painted.pixels, '何も塗らないバーは、待っていることを何も言わない').toBeGreaterThan(
        50,
      );
    } finally {
      restore();
    }
  });

  /* 塗った幅が観測した量である。**幅が数のとおりでなければ、そこに在るのは飾りである。** */
  it('塗った幅は、渡された割合のとおりになる', async () => {
    const host = box();
    const { container } = render(
      <ReadProgress
        label="Reading the conversation"
        scan={{ done: 1, total: 4, text: '1 of 4 MiB read' }}
      />,
      { container: host },
    );
    const fill = container.querySelector('.rp-fill') as HTMLElement;
    const track = container.querySelector('.rp-track') as HTMLElement;

    expect(fill.getBoundingClientRect().width / track.getBoundingClientRect().width).toBeCloseTo(
      0.25,
      2,
    );
    const painted = await paintedBy(fill, track);
    expect(
      painted.pixels,
      '宣言が在って何も塗らない `rp-fill` は、0% と同じ絵である',
    ).toBeGreaterThan(20);
  });

  /* 走る光と塗った幅が同じバーに出ると、どちらが進み具合なのか読めない。止めているのは
     `:not(.measured)` の 1 か所だけで、**外れても `happy-dom` の側からは何も変わらない。**

     ここだけは画素を数えない。光は動いているので、2 枚撮る測り方では毎回別のところに写る。
     知りたいのは位置ではなく、そもそもその箱が在るかどうかである。 */
  it('塗ったバーには、走る光の箱が無い', () => {
    const host = box();
    const measured = render(
      <ReadProgress
        label="Reading the conversation"
        scan={{ done: 0, total: 4, text: '0 of 4 MiB read' }}
      />,
      { container: host },
    );
    const plain = render(<ReadProgress label="Reading transcripts" />, { container: box() });
    const sweep = (view: typeof measured) =>
      globalThis.getComputedStyle(
        view.container.querySelector('.rp-track') as HTMLElement,
        '::after',
      ).content;

    expect(sweep(measured), '塗る幅の上を光が走ると、0% のバーが読めた量を主張する').toBe('none');
    expect(sweep(plain), '分母の無いバーから光まで消すと、待っていることが何も残らない').not.toBe(
      'none',
    );
  });
});

/* 届く中身の場所を先に取る行。**取った場所は、目に見えていなければ取ったことにならない。** */
describe('中身の来る場所', () => {
  it('取っておいた場所は塗られる', async () => {
    const host = box();
    const { container } = render(<ReadingLines lines={3} label="Reading the description" />, {
      container: host,
    });
    const lines = container.querySelector('.rl') as HTMLElement;

    const painted = await paintedBy(lines, host);

    expect(
      painted.pixels,
      '塗らずに場所だけ空けると、そこに何も無いのか、まだ来ていないのかが読めない',
    ).toBeGreaterThan(100);
  });

  /* 取れている場所は、行 1 本の高さと行の数の両方で決まる。**数だけを見ても足りない** ——
     高さを失った行が並んでいても、行の間隔だけで箱は伸びる。 */
  it('取る場所は、行の高さと数の両方で決まる', () => {
    const short = render(<ReadingLines lines={1} label="x" />, { container: box() });
    const tall = render(<ReadingLines lines={4} label="x" />, { container: box() });

    const heightOf = (view: typeof short, selector: string) =>
      (view.container.querySelector(selector) as HTMLElement).getBoundingClientRect().height;
    const text = Number.parseFloat(
      globalThis.getComputedStyle(tall.container.querySelector('.rl') as HTMLElement).fontSize,
    );

    expect(
      heightOf(tall, '.rl-line'),
      '高さの無い行は、1 文字ぶんの場所も取らない',
    ).toBeGreaterThan(text * 0.6);
    expect(
      heightOf(tall, '.rl'),
      '行を増やしても高さが動かないなら、来る中身の量を見ていない',
    ).toBeGreaterThan(heightOf(short, '.rl') * 2);
  });
});

/* 会話パネルは 5 列のグリッドである。**跨がせないと、待ちはいちばん左の列の中に置かれる**
   —— 会話の時刻の真下に左寄せで並び、画面の真ん中で待っているようには見えなくなる。
   潰れても要素は在るので、`happy-dom` の側からは何も変わらない。 */
describe('会話パネルの中の待ち', () => {
  it('待ちのバーは、会話の列を跨いで真ん中に置かれる', () => {
    const host = box();
    host.id = 'conversation';
    // 会話の 1 行ぶん。これが在ることで、跨いでいない要素はいちばん左の列に収まる
    const row = document.createElement('span');
    row.textContent = 'user';
    host.append(row);
    const { container } = render(<ReadProgress label="Reading the conversation" />, {
      container: host,
    });

    const panel = host.getBoundingClientRect();
    const waiting = (container.querySelector('.rp') as HTMLElement).getBoundingClientRect();

    expect(
      waiting.x + waiting.width / 2 - (panel.x + panel.width / 2),
      '左の列に収まった待ちは、会話の時刻の下に貼り付いて出る',
    ).toBeCloseTo(0, 0);
  });
});
