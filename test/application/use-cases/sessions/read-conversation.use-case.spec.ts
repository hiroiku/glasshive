import { describe, expect, it } from 'vitest';
import { type Observation, observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import type {
  TranscriptEventsRepository,
  TranscriptPage,
} from '~/application/ports/repositories/sessions/transcript-events.repository.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import { createReadConversation } from '~/application/use-cases/sessions/read-conversation.use-case.ts';

/* 会話を読む呼び出しを、受けてよいかどうか。

   **ここが緩むと、glasshive はローカルのファイルを何でも配るサーバーになる。**
   任意の絶対パスを受けると、画像を 1 枚読み込ませるだけで `transcript` の全文が外へ流れる。 */

const OBSERVED_FILE = '/nest/projects/a/session.jsonl';
const OBSERVED_SUB = '/nest/projects/a/session/subagents/sub.jsonl';

/* 観測できた `transcript` だけを持つ索引。**この use-case が見るのはこれだけである。**
   会話を読むのに要るのは「そのパスを観測したか」で、木を組む必要はどこにも無い。 */
const indexWith = (files: readonly string[]): TranscriptIndexService => ({
  get: async () =>
    ok({
      index: {
        generatedAtMs: 0,
        activeThresholdMs: 60_000,
        sources: observed(1),
        processes: observed(0),
        stubs: [
          {
            id: 'a',
            slugs: ['a'],
            path: '/nest/a',
            canonicalPath: '/nest/a',
            name: 'a',
            liveProcessCount: 0,
            latestActivityMs: 0,
            transcriptCount: files.length,
          },
        ],
      },
      transcriptFiles: new Set(files),
      groups: [],
    }),
  invalidate: () => undefined,
});

/** 開かれたパスを控える偽のポート。**開いたかどうかそのものが確かめたいこと** */
function spyEvents(): TranscriptEventsRepository & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    async readPage<T>(file: string): Promise<Observation<TranscriptPage<T>>> {
      opened.push(file);
      const page: TranscriptPage<T> = { start: 0, next: 0, eof: true, size: 0, items: [] };
      return observed(page);
    },
  };
}

describe('会話を 1 ページぶん読む', () => {
  it('観測した `transcript` なら開く', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      index: indexWith([OBSERVED_FILE]),
      events,
    });

    const page = await useCase.execute({ file: OBSERVED_FILE, from: null, to: null });

    expect(page.ok).toBe(true);
    expect(events.opened).toEqual([OBSERVED_FILE]);
  });

  it('サブエージェントの `transcript` も開く', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      index: indexWith([OBSERVED_FILE, OBSERVED_SUB]),
      events,
    });

    const page = await useCase.execute({ file: OBSERVED_SUB, from: null, to: null });

    expect(page.ok).toBe(true);
    expect(events.opened).toEqual([OBSERVED_SUB]);
  });

  it('観測していないパスは断る', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      index: indexWith([OBSERVED_FILE]),
      events,
    });

    const page = await useCase.execute({ file: '/etc/passwd', from: null, to: null });

    expect(page.ok).toBe(false);
    if (page.ok) return;
    expect(page.error.code).toBe('transcript.out_of_scope');
    expect(events.opened, '断る呼び出しで `transcript` を開いてはいけない').toEqual([]);
  });

  /* 前方一致で見ていると、観測した `transcript` の隣に置かれただけの別のファイルが
     「中にある」ことになる。集合帰属なら、観測できた `transcript` そのものしか通らない。 */
  it('観測した `transcript` の隣に置いただけのものは通さない', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      index: indexWith([OBSERVED_FILE]),
      events,
    });

    const page = await useCase.execute({
      file: '/nest/projects/a/secrets.jsonl',
      from: null,
      to: null,
    });

    expect(page.ok).toBe(false);
    expect(events.opened).toEqual([]);
  });

  /* 正規化すると表記が変わるものは、正規化せずに断る。正規化して見比べると、観測した `transcript` の
     表記を借りて別の中身を読ませる経路ができる(シンボリックリンクを辿る OS が開くのは別のパスである)。 */
  it('`..` を含むパスは、正規化せずに断る', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      index: indexWith([OBSERVED_FILE]),
      events,
    });

    const page = await useCase.execute({
      file: '/nest/projects/a/../a/session.jsonl',
      from: null,
      to: null,
    });

    expect(page.ok).toBe(false);
    expect(events.opened).toEqual([]);
  });
});
