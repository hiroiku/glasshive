import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { BUCKET_MS, type UsageBucket } from '~/domain/entities/sessions/token-usage.entity.ts';
import {
  bucketByFiveMinutes,
  combineTokens,
  extractUsageRecords,
  mergeBuckets,
  tokensSince,
  totalTokens,
} from '~/domain/services/sessions/token-usage.service.ts';

class Denied extends AppError {
  readonly code = 'test.denied';
}

/** 桶の境目にちょうど載る時刻。ここを起点にすると、丸めの向きが読みやすい */
const BUCKET_START = 1_800_000_000_000;

const at = (ms: number): string => new Date(ms).toISOString();

interface LineParts {
  readonly timestamp: string;
  readonly requestId?: string;
  readonly messageId?: string;
  readonly model?: string;
  readonly input?: number;
  readonly output?: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
}

const assistantLine = (parts: LineParts): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: parts.timestamp,
    ...(parts.requestId === undefined ? {} : { requestId: parts.requestId }),
    message: {
      ...(parts.messageId === undefined ? {} : { id: parts.messageId }),
      model: parts.model ?? 'claude-opus-5',
      usage: {
        input_tokens: parts.input ?? 0,
        output_tokens: parts.output ?? 0,
        cache_read_input_tokens: parts.cacheRead ?? 0,
        cache_creation_input_tokens: parts.cacheWrite ?? 0,
      },
    },
  });

const bucket = (parts: Partial<UsageBucket> & Pick<UsageBucket, 'atMs'>): UsageBucket => ({
  model: 'claude-opus-5',
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  responses: 0,
  ...parts,
});

describe('正本から応答ごとの消費を拾う', () => {
  it('assistant の行で usage を持つものだけを採る', () => {
    const text = [
      // usage が付いていても、応答の行でなければ消費ではない
      JSON.stringify({
        type: 'user',
        timestamp: at(BUCKET_START),
        requestId: 'req-user',
        message: { content: 'hi', usage: { input_tokens: 999 } },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: at(BUCKET_START),
        message: { id: 'm1' },
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 7,
      }),
    ].join('\n');

    const records = extractUsageRecords(text);

    expect(
      records.map((record) => record.key),
      '応答でない行と usage を持たない行は、どちらも消費の記録ではない',
    ).toEqual(['req-1']);
    expect(records[0]?.input).toBe(7);
  });

  it('usage が記録でない行は落とす', () => {
    const text = [
      JSON.stringify({
        type: 'assistant',
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        message: { usage: null },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: at(BUCKET_START),
        requestId: 'req-2',
        message: { usage: [1, 2, 3] },
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-3',
        input: 1,
      }),
    ].join('\n');

    expect(
      extractUsageRecords(text).map((record) => record.key),
      '欄が並びでも「すべて 0 の応答」にはしない',
    ).toEqual(['req-3']);
  });

  it('同じ requestId の行は、後に現れたものだけを数える', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 10,
        output: 1,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 10,
        output: 40,
      }),
    ].join('\n');

    const records = extractUsageRecords(text);

    expect(records, '流し書きの途中の行と最後の行は、同じ 1 応答である').toHaveLength(1);
    expect(records[0]?.output, '後の行ほど累積が進んでいる').toBe(40);
  });

  it('requestId が在れば message.id より先に見る', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        messageId: 'msg-a',
        output: 3,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-2',
        messageId: 'msg-a',
        output: 5,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        messageId: 'msg-z',
        output: 9,
      }),
    ].join('\n');

    const records = extractUsageRecords(text);

    expect(
      records.map((record) => record.key),
      '応答を分けるのは requestId であって message.id ではない',
    ).toEqual(['req-1', 'req-2']);
    expect(records[0]?.output, '同じ requestId なら message.id が違っても同じ応答').toBe(9);
  });

  it('requestId が空文字なら message.id へ落とす', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: '',
        messageId: 'msg-a',
        output: 3,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: '',
        messageId: 'msg-a',
        output: 7,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: '',
        messageId: 'msg-b',
        output: 5,
      }),
    ].join('\n');

    const records = extractUsageRecords(text);

    expect(
      records.map((record) => record.key),
      '空の欄は「無い」と同じ。欄が在ることを理由に別々の応答を 1 つへ潰さない',
    ).toEqual(['msg-a', 'msg-b']);
    expect(records[0]?.output).toBe(7);
  });

  it('requestId が無ければ message.id で応答を分ける', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        messageId: 'msg-a',
        output: 3,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        messageId: 'msg-b',
        output: 5,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        messageId: 'msg-b',
        output: 9,
      }),
    ].join('\n');

    const records = extractUsageRecords(text);

    expect(records.map((record) => record.output)).toEqual([3, 9]);
  });

  it('requestId も message.id も無ければ時刻で応答を分ける', () => {
    const sameTime = [
      assistantLine({ timestamp: at(BUCKET_START), output: 3 }),
      assistantLine({ timestamp: at(BUCKET_START), output: 8 }),
    ].join('\n');
    const otherTime = [
      assistantLine({ timestamp: at(BUCKET_START), output: 3 }),
      assistantLine({ timestamp: at(BUCKET_START + 1000), output: 8 }),
    ].join('\n');

    const collapsed = extractUsageRecords(sameTime);

    expect(collapsed, '同じ時刻の行は見分けようがない').toHaveLength(1);
    expect(collapsed[0]?.key, '時刻そのものが鍵になる').toBe(String(BUCKET_START));
    expect(collapsed[0]?.output, '見分けられない以上、後に現れたもので上書きする').toBe(8);
    expect(extractUsageRecords(otherTime)).toHaveLength(2);
  });

  it('拾った順のまま返す', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START + 2000),
        requestId: 'req-late',
        input: 1,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-early',
        input: 2,
      }),
    ].join('\n');

    expect(
      extractUsageRecords(text).map((record) => record.key),
      '素材は正本に現れた順のまま渡す。並べ替えは畳む側の仕事',
    ).toEqual(['req-late', 'req-early']);
  });

  it('合成メッセージの行は数えない', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        model: '<synthetic>',
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-2',
        input: 4,
      }),
    ].join('\n');

    const records = extractUsageRecords(text);

    expect(
      records.map((record) => record.key),
      '道具が差し込んだ行に消費は無い',
    ).toEqual(['req-2']);
  });

  it('モデル名が無い・字でない行は unknown として数える', () => {
    const missing = JSON.stringify({
      type: 'assistant',
      timestamp: at(BUCKET_START),
      requestId: 'req-1',
      message: { usage: { input_tokens: 2 } },
    });
    const notString = JSON.stringify({
      type: 'assistant',
      timestamp: at(BUCKET_START),
      requestId: 'req-2',
      message: { model: 123, usage: { input_tokens: 2 } },
    });

    expect(extractUsageRecords(missing)[0]?.model).toBe('unknown');
    expect(extractUsageRecords(notString)[0]?.model, 'モデル名は字でなければ名前ではない').toBe(
      'unknown',
    );
  });

  it('時刻の読めない行は落とす', () => {
    const text = [
      assistantLine({ timestamp: 'いつでもない', requestId: 'req-1' }),
      JSON.stringify({
        type: 'assistant',
        requestId: 'req-2',
        message: { usage: {} },
      }),
    ].join('\n');

    expect(extractUsageRecords(text), '桶に入れる先が無い').toHaveLength(0);
  });

  it('欄が無い・数でない usage は 0 として数える', () => {
    const text = JSON.stringify({
      type: 'assistant',
      timestamp: at(BUCKET_START),
      requestId: 'req-1',
      message: { usage: { input_tokens: '128', output_tokens: 5 } },
    });

    const record = extractUsageRecords(text)[0];

    expect(record?.input, '字は数ではない').toBe(0);
    expect(record?.output).toBe(5);
    expect(record?.cacheRead).toBe(0);
    expect(record?.cacheWrite).toBe(0);
  });

  it('壊れた行や空の行は飛ばす', () => {
    const text = [
      '{壊れている',
      '',
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 1,
      }),
    ].join('\n');

    expect(extractUsageRecords(text), '1 行の壊れで正本ひとつぶんを失わない').toHaveLength(1);
  });
});

describe('5 分の桶に畳む', () => {
  it('桶の時刻は幅の始まりへ丸める', () => {
    const text = assistantLine({
      timestamp: at(BUCKET_START + 1000),
      requestId: 'req-1',
      input: 3,
    });

    const buckets = bucketByFiveMinutes(extractUsageRecords(text));

    expect(buckets[0]?.atMs).toBe(BUCKET_START);
  });

  it('ちょうど境目の時刻は、次の桶の始まりになる', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START - 1),
        requestId: 'req-1',
        input: 1,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-2',
        input: 2,
      }),
    ].join('\n');

    const buckets = bucketByFiveMinutes(extractUsageRecords(text));

    expect(
      buckets.map((b) => b.atMs),
      '境目の 1 ミリ秒手前までが前の桶',
    ).toEqual([BUCKET_START - BUCKET_MS, BUCKET_START]);
    expect(buckets.map((b) => b.input)).toEqual([1, 2]);
  });

  it('同じ 5 分でもモデルが違えば別の桶になる', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        model: 'opus',
        input: 1,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-2',
        model: 'haiku',
        input: 2,
      }),
    ].join('\n');

    const buckets = bucketByFiveMinutes(extractUsageRecords(text));

    expect(buckets, 'どのモデルがどれだけ使ったかを分けて見られる').toHaveLength(2);
    expect(buckets.map((b) => b.model).sort()).toEqual(['haiku', 'opus']);
  });

  it('同じ桶の応答を足し合わせ、畳んだ数を持つ', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
      }),
      assistantLine({
        timestamp: at(BUCKET_START + BUCKET_MS - 1),
        requestId: 'req-2',
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
      }),
    ].join('\n');

    const buckets = bucketByFiveMinutes(extractUsageRecords(text));

    expect(buckets).toEqual([
      bucket({
        atMs: BUCKET_START,
        input: 11,
        output: 22,
        cacheRead: 33,
        cacheWrite: 44,
        responses: 2,
      }),
    ]);
  });

  it('流し書きで重ねて現れた応答は 1 つとして数える', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 10,
        output: 1,
      }),
      assistantLine({
        timestamp: at(BUCKET_START),
        requestId: 'req-1',
        input: 10,
        output: 40,
      }),
    ].join('\n');

    expect(bucketByFiveMinutes(extractUsageRecords(text)), '累積を二重に計上しない').toEqual([
      bucket({ atMs: BUCKET_START, input: 10, output: 40, responses: 1 }),
    ]);
  });

  it('桶は時刻の昇順で返す', () => {
    const text = [
      assistantLine({
        timestamp: at(BUCKET_START + BUCKET_MS * 2),
        requestId: 'req-1',
      }),
      assistantLine({ timestamp: at(BUCKET_START), requestId: 'req-2' }),
      assistantLine({
        timestamp: at(BUCKET_START + BUCKET_MS),
        requestId: 'req-3',
      }),
    ].join('\n');

    const buckets = bucketByFiveMinutes(extractUsageRecords(text));

    expect(
      buckets.map((b) => b.atMs),
      '正本に現れた順ではなく、山の形が読める順で渡す',
    ).toEqual([BUCKET_START, BUCKET_START + BUCKET_MS, BUCKET_START + BUCKET_MS * 2]);
  });

  it('応答が 1 つも無ければ桶も無い', () => {
    expect(bucketByFiveMinutes([])).toEqual([]);
  });
});

describe('1 正本の総消費', () => {
  it('読み直した分は数えず、すべての桶を足す', () => {
    const buckets = [
      bucket({
        atMs: BUCKET_START,
        input: 1,
        output: 2,
        cacheRead: 1000,
        cacheWrite: 4,
      }),
      bucket({
        atMs: BUCKET_START + BUCKET_MS,
        input: 10,
        output: 20,
        cacheRead: 5000,
        cacheWrite: 40,
      }),
    ];

    expect(totalTokens(buckets), 'cacheRead は前に書いた分の読み直しである').toBe(77);
  });

  it('桶が無ければ 0', () => {
    expect(totalTokens([])).toBe(0);
  });
});

describe('複数の正本を合流する', () => {
  it('同じ時刻と同じモデルの桶を足し合わせる', () => {
    const session = [
      bucket({
        atMs: BUCKET_START,
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        responses: 1,
      }),
    ];
    const subagent = [
      bucket({
        atMs: BUCKET_START,
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
        responses: 3,
      }),
    ];

    expect(mergeBuckets([session, subagent], 0)).toEqual([
      bucket({
        atMs: BUCKET_START,
        input: 11,
        output: 22,
        cacheRead: 33,
        cacheWrite: 44,
        responses: 4,
      }),
    ]);
  });

  it('渡された桶を書き換えない', () => {
    const session = [bucket({ atMs: BUCKET_START, input: 1, responses: 1 })];

    mergeBuckets([session, session], 0);

    expect(session[0]?.input, '合流は新しい桶を作る。素材はそのまま残る').toBe(1);
  });

  it('モデルが違えば足さない', () => {
    const a = [bucket({ atMs: BUCKET_START, model: 'opus', input: 1 })];
    const b = [bucket({ atMs: BUCKET_START, model: 'haiku', input: 2 })];

    expect(mergeBuckets([a, b], 0)).toHaveLength(2);
  });

  it('窓より前の桶は落とす', () => {
    const buckets = [
      bucket({ atMs: BUCKET_START - BUCKET_MS, input: 1 }),
      bucket({ atMs: BUCKET_START, input: 2 }),
    ];

    const merged = mergeBuckets([buckets], BUCKET_START);

    expect(
      merged.map((b) => b.atMs),
      '窓の始まりに載る桶は残る',
    ).toEqual([BUCKET_START]);
  });

  it('時刻の昇順で返す', () => {
    const late = [bucket({ atMs: BUCKET_START + BUCKET_MS * 2 })];
    const early = [bucket({ atMs: BUCKET_START })];
    const middle = [bucket({ atMs: BUCKET_START + BUCKET_MS })];

    expect(mergeBuckets([late, early, middle], 0).map((b) => b.atMs)).toEqual([
      BUCKET_START,
      BUCKET_START + BUCKET_MS,
      BUCKET_START + BUCKET_MS * 2,
    ]);
  });

  it('正本が 1 つも無ければ桶も無い', () => {
    expect(mergeBuckets([], 0)).toEqual([]);
  });
});

describe('直近の窓だけの消費', () => {
  it('窓より前の桶を数に混ぜない', () => {
    const buckets = [
      bucket({
        atMs: BUCKET_START - BUCKET_MS,
        input: 100,
        output: 100,
        cacheWrite: 100,
      }),
      bucket({
        atMs: BUCKET_START + BUCKET_MS,
        input: 1,
        output: 2,
        cacheWrite: 4,
      }),
    ];

    expect(tokensSince(buckets, BUCKET_START), '窓の外の 300 は入らない').toBe(7);
  });

  it('窓の境目にちょうど載る桶は内側に数える', () => {
    const buckets = [bucket({ atMs: BUCKET_START, input: 5, output: 0, cacheWrite: 0 })];

    expect(tokensSince(buckets, BUCKET_START)).toBe(5);
  });

  it('読み直した分は総消費と同じく数えない', () => {
    const buckets = [bucket({ atMs: BUCKET_START, input: 1, cacheRead: 9999, cacheWrite: 2 })];

    expect(tokensSince(buckets, BUCKET_START)).toBe(3);
  });

  it('窓の中に桶が 1 つも無ければ 0', () => {
    const buckets = [bucket({ atMs: BUCKET_START - 1, input: 500 })];

    expect(tokensSince(buckets, BUCKET_START), '静かだったのだから 0 である').toBe(0);
  });
});

describe('正本ごとの数を巣ひとつぶんに束ねる', () => {
  it('見えた数を足す', () => {
    expect(combineTokens([observed(3), observed(4)])).toEqual(observed(7));
  });

  it('無かった正本は 0 として足す', () => {
    const parts = [observed(5), absent('out-of-window'), absent('no-source')];

    expect(combineTokens(parts), '窓の外に消費が無いことは分かっている').toEqual(observed(5));
  });

  it('1 つでも読めなければ束ねた数も読めなかったことにする', () => {
    const blocked = unobservable(new Denied('読めない'));
    const parts = [observed(1_000_000), blocked, observed(2_000_000)];

    expect(
      combineTokens(parts),
      '読めた分だけを足すと、実際より小さい数が全部の顔をして並ぶ',
    ).toEqual(blocked);
  });

  it('読めなかったものが複数あっても、最初のものを理由に採る', () => {
    const first = unobservable(new Denied('読めない'));
    const second = unobservable(new Denied('読めない'));

    expect(combineTokens([first, second])).toBe(first);
  });

  it('正本が 1 つも無ければ 0', () => {
    expect(combineTokens([])).toEqual(observed(0));
  });
});
