import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsTranscriptEventsRepository } from '~/infrastructure/repositories/sessions/fs-transcript-events.repository.ts';

/* バイトの位置でページを切る。**glasshive で唯一、純関数にできない読み方である。**

   本物のファイルで確かめる。偽の fs に当てても、行の頭を探して遡る挙動も、
   書き込み途中の末尾も再現できない — どちらもバイトの並びそのものの話である。 */

const REQUEST = {
  from: null as number | null,
  to: null as number | null,
  tailWindowBytes: 64,
  maxChunkBytes: 1024 * 1024,
  maxItems: 500,
  readBlockBytes: 16,
};

/** 読んだ行をそのまま `items` にする。ページの切り方だけを見たいので、パースしない */
const asIs = (line: string) => line.trimEnd();

let root: string;
let file: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-events-'));
  file = path.join(root, 'session.jsonl');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (text: string): void => {
  fs.writeFileSync(file, text);
};

describe('`transcript` をページに切る', () => {
  it('先頭から読めば、行がそのまま並ぶ', async () => {
    write('a\nb\nc\n');
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 0 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items).toEqual(['a', 'b', 'c']);
    expect(page.value.start, '先頭は行の頭なので、揃え直しは起きない').toBe(0);
    expect(page.value.next).toBe(6);
    expect(page.value.eof).toBe(true);
    expect(page.value.size).toBe(6);
  });

  /* 行の途中から読み始めると、そこから最初の改行までは 1 行の残りでしかない。
     パースしようとしても必ず失敗するので、捨てて次の行の頭から始める。 */
  it('行の途中を指されたら、その行の残りは捨てる', async () => {
    write('aaaa\nbbbb\ncccc\n');
    const repository = createFsTranscriptEventsRepository();

    // 'aaaa\n' の途中(2 バイト目)を指す
    const page = await repository.readPage(file, { ...REQUEST, from: 2 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items, '欠けた行を混ぜない').toEqual(['bbbb', 'cccc']);
    expect(page.value.start, '読み始めたのは次の行の頭である').toBe(5);
  });

  /* 追いかけて読むときは、前回の `next` をそのまま渡す。そこは必ず行の頭なので、
     捨てるものは無い。**捨ててしまうと、追いかけるたびに 1 行ずつ黙って欠ける。** */
  it('行の頭を指されたら、そのまま読む', async () => {
    write('aaaa\nbbbb\ncccc\n');
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 5 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items, '行の頭なのに 1 行捨てている').toEqual(['bbbb', 'cccc']);
    expect(page.value.start).toBe(5);
  });

  /* 書いている最中の `transcript` は、末尾が改行で終わっていない。そこを消費すると、
     その行が書き上がった後にもう一度読む手段が無くなる。 */
  it('書き込み途中の末尾行を消費しない', async () => {
    write('aaaa\nbbbb\ncc');
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 0 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items, '途中の行を 1 行として読んでいる').toEqual(['aaaa', 'bbbb']);
    expect(page.value.next, '途中の行のぶんまで位置を進めてはいけない').toBe(10);
    expect(page.value.eof, 'まだ読んでいないテキストが残っている').toBe(false);
  });

  it('書き上がったら、次の呼び出しでその行が読める', async () => {
    write('aaaa\nbbbb\ncc');
    const repository = createFsTranscriptEventsRepository();

    const first = await repository.readPage(file, { ...REQUEST, from: 0 }, asIs);
    expect(first.kind).toBe('observed');
    if (first.kind !== 'observed') return;

    fs.appendFileSync(file, 'cc\n');
    const second = await repository.readPage(file, { ...REQUEST, from: first.value.next }, asIs);

    expect(second.kind).toBe('observed');
    if (second.kind !== 'observed') return;
    expect(second.value.items, '書き上がった行を丸ごと読めていない').toEqual(['cccc']);
    expect(second.value.eof).toBe(true);
  });

  it('位置を指さなければ、末尾の読み取り範囲から読む', async () => {
    // 1 行 10 バイト × 20 行 = 200 バイト。読み取り範囲は 64 バイトなので末尾 7 行ぶんに掛かる
    write(
      `${Array.from({ length: 20 }, (_, index) => String(index).padStart(9, '0')).join('\n')}\n`,
    );
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, REQUEST, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.start, '読み取り範囲の先頭は行頭に揃っている').toBe(140);
    expect(page.value.items).toEqual([
      '000000014',
      '000000015',
      '000000016',
      '000000017',
      '000000018',
      '000000019',
    ]);
    expect(page.value.eof).toBe(true);
  });

  /* 上限は「呼ぶ側にとって意味のあった `items`」で数える。行で数えると、
     見せるものが 1 つも無いページが返ることがある。 */
  it('上限は、残った `items` の数で数える', async () => {
    write('keep\ndrop\nkeep\ndrop\nkeep\n');
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 0, maxItems: 2 }, (line) =>
      line.startsWith('keep') ? line.trimEnd() : null,
    );

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items).toEqual(['keep', 'keep']);
    expect(page.value.next, '落とした行のぶんも位置は進む').toBe(15);
  });

  it('読み進む量の上限に当たったら、そこで止める', async () => {
    write('aaaa\nbbbb\ncccc\n');
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 0, maxChunkBytes: 6 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items).toEqual(['aaaa', 'bbbb']);
    expect(page.value.next).toBe(10);
    expect(page.value.eof).toBe(false);
  });

  it('ここまでと言われた位置を越えない', async () => {
    write('aaaa\nbbbb\ncccc\n');
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 0, to: 5 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items).toEqual(['aaaa']);
    expect(page.value.next).toBe(5);
  });

  it('無い `transcript` は、無いと言う', async () => {
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(path.join(root, 'nope.jsonl'), REQUEST, asIs);

    expect(page.kind).toBe('absent');
  });

  it('行が読む単位より長くても、繋いで 1 行として読む', async () => {
    const long = 'x'.repeat(100);
    write(`${long}\nshort\n`);
    const repository = createFsTranscriptEventsRepository();

    const page = await repository.readPage(file, { ...REQUEST, from: 0, readBlockBytes: 8 }, asIs);

    expect(page.kind).toBe('observed');
    if (page.kind !== 'observed') return;
    expect(page.value.items).toEqual([long, 'short']);
  });
});
