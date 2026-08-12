import { describe, expect, it } from 'vitest';
import {
  COMMAND_HEADER,
  COMMAND_HEADER_VALUE,
  fromCommandLine,
} from '~/frameworks/node/cli-request.ts';

/* ディレクトリを名指せるのはコマンドラインだけである。ここが「コマンドから来た」と誤れば、
   開いているどのページも任意のディレクトリを glasshive に読ませられる。 */

const asked = (headers: Record<string, string>): boolean => fromCommandLine(new Headers(headers));

describe('コマンドラインから来た求めか', () => {
  it('決めたヘッダーを付けて来たら、コマンドである', () => {
    expect(asked({ [COMMAND_HEADER]: COMMAND_HEADER_VALUE })).toBe(true);
  });

  /* ブラウザーは別のオリジンへ独自のヘッダーを付けられない(preflight が要る)。付いていない
     求めはブラウザーからでも出せるので、そこを通すと見分けが無くなる。 */
  it('ヘッダーが無ければ、コマンドではない', () => {
    expect(asked({ 'content-type': 'application/json' })).toBe(false);
    expect(asked({ [COMMAND_HEADER]: 'yes' }), '値まで合っていなければ通さない').toBe(false);
  });

  /* Node の `fetch` も `sec-fetch-mode` を付けて送る。それで見分けようとすると、
     コマンドの求めまで断ることになる。 */
  it('`Sec-Fetch-Mode` が付いていても、ヘッダーが在ればコマンドである', () => {
    expect(asked({ [COMMAND_HEADER]: COMMAND_HEADER_VALUE, 'sec-fetch-mode': 'cors' })).toBe(true);
  });

  /* 画面から名指せてはいけない。ブラウザーの求めは `Origin` を必ず連れてくる。 */
  it('`Origin` を連れてきたら、コマンドではない', () => {
    expect(asked({ [COMMAND_HEADER]: COMMAND_HEADER_VALUE, origin: 'http://127.0.0.1:4483' })).toBe(
      false,
    );
  });
});
