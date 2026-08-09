import { describe, expect, it } from 'vitest';
import { capText, reduceEvent } from '~/domain/services/sessions/conversation.service.ts';
import {
  MAX_TEXT_CHARS,
  TRUNCATION_NOTICE,
} from '~/domain/value-objects/sessions/event-page.value-object.ts';

const line = (value: unknown): string => JSON.stringify(value);

describe('運ぶ量の上限で切る', () => {
  it('上限ちょうどでは切らない', () => {
    expect(capText('abcde', 5), '切っていない字に印を足すと、無い切り詰めを知らせる').toBe('abcde');
  });

  it('1 つ超えたら切って、切った印を添える', () => {
    expect(capText('abcdef', 5)).toBe(`abcde${TRUNCATION_NOTICE}`);
  });

  it('絵文字が途中で割れない', () => {
    // UTF-16 の長さで切ると 'a' + 前半だけの代用対 になり、壊れた字が出る
    expect(capText('a😀b', 2)).toBe(`a😀${TRUNCATION_NOTICE}`);
    expect(capText('😀😀😀', 2)).toBe(`😀😀${TRUNCATION_NOTICE}`);
  });

  it('上限を言わなければ、運ぶ量の既定で切る', () => {
    const text = 'あ'.repeat(MAX_TEXT_CHARS + 1);
    expect(capText(text)).toBe(`${'あ'.repeat(MAX_TEXT_CHARS)}${TRUNCATION_NOTICE}`);
  });
});

describe('会話に出さない行', () => {
  it('題を書いただけの行はイベントではない', () => {
    expect(reduceEvent(line({ type: 'ai-title', aiTitle: 'タイトルはこれ' }))).toBeNull();
  });

  it('読めない行はイベントではない', () => {
    expect(reduceEvent('{"type":"user"'), '書き込み途中の行が会話を壊してはいけない').toBeNull();
  });

  it('知らない型の行はイベントではない', () => {
    expect(reduceEvent(line({ type: 'summary', summary: 'まとめ' }))).toBeNull();
  });

  it('記録でない行はイベントではない', () => {
    // 読めても記録でない行は在り得る。型を確かめる前に落ちてはいけない
    expect(reduceEvent('12')).toBeNull();
    expect(reduceEvent('null')).toBeNull();
    expect(reduceEvent('"user"')).toBeNull();
    expect(reduceEvent('[{"type":"user","message":{"content":"a"}}]')).toBeNull();
    expect(reduceEvent('')).toBeNull();
  });
});

describe('人の側の行', () => {
  it('中身が字なら、その字ひとつの塊になる', () => {
    expect(
      reduceEvent(
        line({
          type: 'user',
          timestamp: 't0',
          message: { content: '最初の依頼' },
        }),
      ),
    ).toEqual({
      role: 'user',
      ts: 't0',
      blocks: [{ kind: 'text', text: '最初の依頼' }],
    });
  });

  it('時刻の字面には手を加えない', () => {
    const event = reduceEvent(
      line({
        type: 'user',
        timestamp: '2026-08-04T00:00:00Z',
        message: { content: 'a' },
      }),
    );
    expect(event?.ts).toBe('2026-08-04T00:00:00Z');
  });

  it('時刻が字でなければ無しにする', () => {
    const event = reduceEvent(line({ type: 'user', timestamp: 12345, message: { content: 'a' } }));
    expect(event?.ts).toBeNull();
  });

  it('道具の返しが並びのとき、字の text だけが改行で繋がる', () => {
    const event = reduceEvent(
      line({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              content: [
                { type: 'text', text: '一行目' },
                { type: 'image', source: {} },
                { type: 'text', text: 12345 },
                { type: 'text', text: '二行目' },
              ],
            },
          ],
        },
      }),
    );
    expect(event?.blocks, '字でない返しは会話の流れとして読めない').toEqual([
      { kind: 'tool_result', text: '一行目\n二行目' },
    ]);
  });

  it('道具の返しが字ならそのまま、中身が無ければ空になる', () => {
    const event = reduceEvent(
      line({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', content: 'そのまま' }, { type: 'tool_result' }],
        },
      }),
    );
    expect(event?.blocks).toEqual([
      { kind: 'tool_result', text: 'そのまま' },
      { kind: 'tool_result', text: '' },
    ]);
  });

  it('返しが字でも並びでもなければ、空の返しとして見せる', () => {
    // 内部の形をそのまま直列化して見せると、読む人には道具の中身が漏れるだけになる
    const event = reduceEvent(
      line({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', content: { text: 'x' } },
            { type: 'tool_result', content: 42 },
            { type: 'tool_result', content: null },
          ],
        },
      }),
    );
    expect(event?.blocks).toEqual([
      { kind: 'tool_result', text: '' },
      { kind: 'tool_result', text: '' },
      { kind: 'tool_result', text: '' },
    ]);
  });

  it('塊でない要素は落とす', () => {
    // 並びに生の字が混ざる正本がある。型の欄が無い要素は、何の塊か決められない
    const event = reduceEvent(
      line({
        type: 'user',
        message: { content: ['そのままの字', { type: 'text', text: 'A' }] },
      }),
    );
    expect(event?.blocks).toEqual([{ kind: 'text', text: 'A' }]);
    expect(
      reduceEvent(
        line({
          type: 'user',
          message: { content: [[{ type: 'text', text: 'A' }]] },
        }),
      ),
      '入れ子の並びも塊ではない',
    ).toBeNull();
  });

  it('text と tool_result 以外の塊は落ちるが、残りの並びは崩れない', () => {
    const event = reduceEvent(
      line({
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'A' },
            { type: 'image', source: {} },
            { type: 'thinking', thinking: '考え' },
            { type: 'tool_result', content: 'R' },
            { type: 'text', text: 'B' },
          ],
        },
      }),
    );
    expect(event?.blocks, '人の側に考えの塊は出ない').toEqual([
      { kind: 'text', text: 'A' },
      { kind: 'tool_result', text: 'R' },
      { kind: 'text', text: 'B' },
    ]);
  });

  it('空白だけでも、人の言葉は塊になる', () => {
    // 道具の側とは違い、人の側は空白を落とさない。人が空白を送ったことは事実である
    expect(reduceEvent(line({ type: 'user', message: { content: '   ' } }))?.blocks).toEqual([
      { kind: 'text', text: '   ' },
    ]);
    expect(
      reduceEvent(
        line({
          type: 'user',
          message: { content: [{ type: 'text', text: ' \n ' }] },
        }),
      )?.blocks,
    ).toEqual([{ kind: 'text', text: ' \n ' }]);
  });

  it('見せる塊が 1 つも無ければイベントではない', () => {
    expect(
      reduceEvent(
        line({
          type: 'user',
          message: { content: [{ type: 'text', text: 7 }] },
        }),
      ),
    ).toBeNull();
    expect(reduceEvent(line({ type: 'user', message: { content: { text: 'a' } } }))).toBeNull();
    expect(reduceEvent(line({ type: 'user', message: { content: [] } }))).toBeNull();
    expect(reduceEvent(line({ type: 'user' }))).toBeNull();
  });
});

describe('道具の側の行', () => {
  it('道具の呼び出しは、呼び名と整形された入力を持つ', () => {
    const event = reduceEvent(
      line({
        type: 'assistant',
        timestamp: 't1',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo hi' } }],
        },
      }),
    );
    expect(event?.blocks).toEqual([
      { kind: 'tool_use', name: 'Bash', text: '{\n  "command": "echo hi"\n}' },
    ]);
  });

  it('呼び名が無ければ、道具とだけ呼ぶ', () => {
    const event = reduceEvent(
      line({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }),
    );
    expect(event?.blocks, '入力が無くても、呼んだこと自体は見せる').toEqual([
      { kind: 'tool_use', name: 'tool', text: '{}' },
    ]);
  });

  it('呼び名が空の字でも、道具とだけ呼ぶ', () => {
    // 欄の有無ではなく中身の有無で決める。名無しの塊に空の見出しを付けても読めない
    const event = reduceEvent(
      line({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: '' }] },
      }),
    );
    expect(event?.blocks).toEqual([{ kind: 'tool_use', name: 'tool', text: '{}' }]);
  });

  it('入力が無いことと、入力が null であることは同じに見せる', () => {
    const event = reduceEvent(
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'A', input: null },
            { type: 'tool_use', name: 'B', input: '字の入力' },
          ],
        },
      }),
    );
    expect(event?.blocks).toEqual([
      { kind: 'tool_use', name: 'A', text: '{}' },
      { kind: 'tool_use', name: 'B', text: '"字の入力"' },
    ]);
  });

  it('道具の返しは道具の側には出ない', () => {
    // 返しは人の側の行に書かれる。道具の側で拾うと同じ返しが二重に並ぶ
    expect(
      reduceEvent(
        line({
          type: 'assistant',
          message: { content: [{ type: 'tool_result', content: '返し' }] },
        }),
      ),
    ).toBeNull();
  });

  it('並びが空ならイベントではない', () => {
    expect(reduceEvent(line({ type: 'assistant', message: { content: [] } }))).toBeNull();
  });

  it('中身が空白だけの text と thinking は塊にならない', () => {
    const event = reduceEvent(
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '   \n ' },
            { type: 'thinking', thinking: '', signature: 'sig' },
            { type: 'text', text: '見せる本文' },
          ],
        },
      }),
    );
    expect(event?.blocks).toEqual([{ kind: 'text', text: '見せる本文' }]);
  });

  it('空白だけの行はイベントではない', () => {
    expect(
      reduceEvent(
        line({
          type: 'assistant',
          message: {
            content: [{ type: 'thinking', thinking: ' ', signature: 'sig' }],
          },
        }),
      ),
      '空箱だけの行を出すと、読む人には意味の無い行が並ぶ',
    ).toBeNull();
  });

  it('中身が並びでなければイベントではない', () => {
    expect(reduceEvent(line({ type: 'assistant', message: { content: '字の本文' } }))).toBeNull();
  });

  it('考えは、本文があるときだけ見せる', () => {
    const event = reduceEvent(
      line({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: 'こう考えた' }] },
      }),
    );
    expect(event?.blocks).toEqual([{ kind: 'thinking', text: 'こう考えた' }]);
  });
});

describe('仕組みの側の行', () => {
  it('中身が字なら、下位の型を呼び名にした塊ひとつになる', () => {
    expect(reduceEvent(line({ type: 'system', subtype: 'hook', content: '知らせ' }))).toEqual({
      role: 'system',
      ts: null,
      blocks: [{ kind: 'system', name: 'hook', text: '知らせ' }],
    });
  });

  it('下位の型が無ければ呼び名は無しになる', () => {
    const event = reduceEvent(line({ type: 'system', content: '知らせ' }));
    expect(event?.blocks).toEqual([{ kind: 'system', name: null, text: '知らせ' }]);
  });

  it('下位の型が字でなければ呼び名は無しになる', () => {
    const event = reduceEvent(line({ type: 'system', subtype: 7, content: '知らせ' }));
    expect(event?.blocks).toEqual([{ kind: 'system', name: null, text: '知らせ' }]);
  });

  it('中身が字でなければイベントではない', () => {
    expect(reduceEvent(line({ type: 'system', content: { text: '知らせ' } }))).toBeNull();
    expect(reduceEvent(line({ type: 'system', subtype: 'hook' }))).toBeNull();
  });

  it('中身は行の直下にあり、message の下ではない', () => {
    // 仕組みの知らせだけは message を持たない。message を見に行くと全て落ちる
    expect(reduceEvent(line({ type: 'system', message: { content: '知らせ' } }))).toBeNull();
  });
});

describe('塊ごとに運ぶ量を切る', () => {
  it('どの塊も同じ上限で切られる', () => {
    const event = reduceEvent(
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'abcdef' },
            { type: 'tool_use', name: 'Bash', input: { command: 'echo hi' } },
          ],
        },
      }),
      5,
    );
    expect(event?.blocks).toEqual([
      { kind: 'text', text: `abcde${TRUNCATION_NOTICE}` },
      { kind: 'tool_use', name: 'Bash', text: `{\n  "${TRUNCATION_NOTICE}` },
    ]);
  });

  it('人の言葉も・道具の返しも・考えも・仕組みの知らせも切られる', () => {
    // 1 箇所でも上限を渡し忘れると、その道だけが上限なしで運ばれる
    const cut = `abc${TRUNCATION_NOTICE}`;
    expect(reduceEvent(line({ type: 'user', message: { content: 'abcdef' } }), 3)?.blocks).toEqual([
      { kind: 'text', text: cut },
    ]);
    expect(
      reduceEvent(
        line({
          type: 'user',
          message: {
            content: [
              { type: 'text', text: 'abcdef' },
              { type: 'tool_result', content: [{ text: 'abcdef' }] },
            ],
          },
        }),
        3,
      )?.blocks,
    ).toEqual([
      { kind: 'text', text: cut },
      { kind: 'tool_result', text: cut },
    ]);
    expect(
      reduceEvent(
        line({
          type: 'assistant',
          message: { content: [{ type: 'thinking', thinking: 'abcdef' }] },
        }),
        3,
      )?.blocks,
    ).toEqual([{ kind: 'thinking', text: cut }]);
    expect(
      reduceEvent(line({ type: 'system', subtype: 'hook', content: 'abcdef' }), 3)?.blocks,
    ).toEqual([{ kind: 'system', name: 'hook', text: cut }]);
  });
});
