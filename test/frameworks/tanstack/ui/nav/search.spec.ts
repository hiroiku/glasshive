import { describe, expect, it } from 'vitest';
import { GANTT_WINDOWS, MONTH_MS } from '~/frameworks/tanstack/ui/derive/issueGantt.ts';
import { parseProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* URL の検索パラメータは人が手で書き換えられる場所である。**読めない値で画面を止めない。**

   見ているのはタイムラインの幅だけだが、ここが崩れると「この期間で見て」と渡した URL が
   別の軸で開く。 */

describe('タイムラインの幅の検索パラメータ', () => {
  it('`GANTT_WINDOWS` のラベルをそのまま受ける', () => {
    const label = GANTT_WINDOWS.find((preset) => preset.key === MONTH_MS)?.label;

    expect(parseProjectSearch({ gw: label }).gw).toBe(label);
  });

  it('選べない幅は、載っていなかったことにする', () => {
    expect(parseProjectSearch({ gw: '2mo' }).gw).toBe(undefined);
    expect(parseProjectSearch({ gw: 42 }).gw).toBe(undefined);
    expect(parseProjectSearch({}).gw).toBe(undefined);
  });
});
