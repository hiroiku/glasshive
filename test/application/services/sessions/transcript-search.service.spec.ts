import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type {
  TranscriptRepository,
  TranscriptStat,
  TranscriptWindow,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createTranscriptSearch } from '~/application/services/sessions/transcript-search.service.ts';

/* 探しは置き場を開くかどうかの決め事の塊なので、下地は答えを並べるだけの偽物でよい。
   確かめるのは「どれを開いたか」と「見付からないことと見に行けないことを分けているか」である。 */

const MIB = 1024 * 1024;
const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const DAY_MS = 86_400_000;
const SINCE = NOW - 7 * DAY_MS;

/** 探しが末尾から読む量。**この数は契約である** */
const SEARCH_TAIL = 1 * MIB;

interface Fake {
  readonly stat: Observation<TranscriptStat>;
  readonly tail: Observation<TranscriptWindow>;
}

const found = (text: string, mtimeMs = NOW): Fake => ({
  stat: observed({ mtimeMs, sizeBytes: text.length }),
  tail: observed({ text, complete: true }),
});

function createStub(files: Readonly<Record<string, Fake>>) {
  const opened: string[] = [];
  const asks: { maxBytes: number; trimPartialLine: boolean }[] = [];
  const missing: Fake = {
    stat: absent('no-source'),
    tail: absent('no-source'),
  };
  const transcripts: TranscriptRepository = {
    async listTranscripts() {
      return observed([]);
    },
    async statTranscript(file) {
      return (files[file] ?? missing).stat;
    },
    async readHead() {
      return observed({ text: '', complete: true });
    },
    async readTail(at, ask) {
      opened.push(at.file);
      asks.push(ask);
      return (files[at.file] ?? missing).tail;
    },
    async canonicalize(target) {
      return observed(target);
    },
  };
  return { opened, asks, search: createTranscriptSearch({ transcripts }) };
}

const options = { sinceMs: SINCE, limit: 200 };

describe('正本の末尾から探す', () => {
  it('語を含む正本だけを返す', async () => {
    const stub = createStub({
      '/w/a.jsonl': found('ここに NEEDLE がある'),
      '/w/b.jsonl': found('ここには無い'),
    });

    const hits = await stub.search.findTails(['/w/a.jsonl', '/w/b.jsonl'], 'needle', options);
    expect(hits, '小文字に均してから当てるので、大文字で書かれていても当たる').toEqual({
      kind: 'observed',
      value: ['/w/a.jsonl'],
    });
  });

  it('末尾 1MiB だけを見る。字面で当てるので、切れた行は繕わない', async () => {
    const stub = createStub({ '/w/a.jsonl': found('needle') });

    await stub.search.findTails(['/w/a.jsonl'], 'needle', options);
    expect(stub.asks).toEqual([{ maxBytes: SEARCH_TAIL, trimPartialLine: false }]);
  });

  it('窓より前に書き終わった正本は開かない', async () => {
    const stub = createStub({
      '/w/a.jsonl': found('needle', NOW - 8 * DAY_MS),
    });

    const hits = await stub.search.findTails(['/w/a.jsonl'], 'needle', options);
    expect(hits).toEqual({ kind: 'observed', value: [] });
    expect(stub.opened, '開くだけ無駄だと分かっているものは、触りもしない').toEqual([]);
  });

  it('上限の数で打ち切る', async () => {
    const stub = createStub({
      '/w/a.jsonl': found('needle'),
      '/w/b.jsonl': found('needle'),
    });

    const hits = await stub.search.findTails(['/w/a.jsonl', '/w/b.jsonl'], 'needle', {
      sinceMs: SINCE,
      limit: 1,
    });
    expect(hits, '開いた数ではなく、当たった数で打ち切る').toEqual({
      kind: 'observed',
      value: ['/w/a.jsonl'],
    });
    expect(stub.opened).toEqual(['/w/a.jsonl']);
  });

  it('消えた正本は飛ばして、探しを続ける', async () => {
    const stub = createStub({ '/w/a.jsonl': found('needle') });

    const hits = await stub.search.findTails(['/w/いない.jsonl', '/w/a.jsonl'], 'needle', options);
    expect(hits).toEqual({ kind: 'observed', value: ['/w/a.jsonl'] });
  });

  it('読めない正本があれば、探しそのものを見に行けなかったことにする', async () => {
    const stub = createStub({
      '/w/a.jsonl': {
        stat: observed({ mtimeMs: NOW, sizeBytes: 10 }),
        tail: unobservable(new UnexpectedError('読めない')),
      },
    });

    const hits = await stub.search.findTails(['/w/a.jsonl'], 'needle', options);
    expect(hits.kind, '見付からなかったのか、見に行けなかったのかを取り違えさせない').toBe(
      'unobservable',
    );
  });

  it('大きさすら見に行けない正本も、飛ばさず持ち帰る', async () => {
    const stub = createStub({
      '/w/a.jsonl': {
        stat: unobservable(new UnexpectedError('棚に入れない')),
        tail: observed({ text: 'needle', complete: true }),
      },
    });

    const hits = await stub.search.findTails(['/w/a.jsonl'], 'needle', options);
    expect(hits.kind, '黙って飛ばすと、その中の当たりが「無かった」として消える').toBe(
      'unobservable',
    );
    expect(stub.opened).toEqual([]);
  });
});
