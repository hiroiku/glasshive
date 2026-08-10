import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import { readConversation } from '~/interface/controllers/sessions/conversation.controller.ts';

/* 届いたリクエストを、会話への問いとして読めるときだけ受ける。

   境目でしか止められない。内側は読める問いしか受け取らない作りなので、
   形の食い違いはここで断る。 */

/* 相手の形は、検証する `readConversation` 自身から引く。ここは内側の名前を `import` できないし、
   書き写して持てば、形が変わったときに片方だけ古いまま残る。 */
type ReadConversationUseCase = Parameters<typeof readConversation>[0];
type ConversationRequest = Parameters<ReadConversationUseCase['execute']>[0];

/** 断りの偽物。エラーコードだけが同じであればよく、内側の型は要らない */
class OutOfScope extends AppError {
  readonly code = 'transcript.out_of_scope';
}

/** 内側へ渡ったリクエストを控える偽のユースケース */
function spyUseCase(): ReadConversationUseCase & { readonly seen: ConversationRequest[] } {
  const seen: ConversationRequest[] = [];
  return {
    seen,
    async execute(request) {
      seen.push(request);
      return ok(observed({ start: 0, next: 0, eof: true, size: 0, items: [] }));
    },
  };
}

const refusing: ReadConversationUseCase = {
  async execute() {
    return err(new OutOfScope('観測していない `transcript` を開こうとした'));
  },
};

describe('会話のリクエストを検証する', () => {
  it('パスと位置をそのまま渡す', async () => {
    const useCase = spyUseCase();

    const response = await readConversation(useCase, { file: '/nest/s.jsonl', from: 10, to: 20 });

    expect(response.ok).toBe(true);
    expect(useCase.seen).toEqual([{ file: '/nest/s.jsonl', from: 10, to: 20 }]);
  });

  /* `-1` を「末尾から」のマーカーとして送ってくるクライアントがある。負の数をここで
     受けておかないと、古い読み取り位置が黙って先頭から読み直される。 */
  it('負の位置は「末尾から」と読む', async () => {
    const useCase = spyUseCase();

    await readConversation(useCase, { file: '/nest/s.jsonl', from: -1 });

    expect(useCase.seen[0]).toEqual({ file: '/nest/s.jsonl', from: null, to: null });
  });

  it('位置が無ければ「末尾から」と読む', async () => {
    const useCase = spyUseCase();

    await readConversation(useCase, { file: '/nest/s.jsonl' });

    expect(useCase.seen[0]).toEqual({ file: '/nest/s.jsonl', from: null, to: null });
  });

  it('数として読めない位置は「末尾から」に倒す', async () => {
    const useCase = spyUseCase();

    await readConversation(useCase, { file: '/nest/s.jsonl', from: 'ここから' });

    expect(useCase.seen[0]?.from).toBeNull();
  });

  it('パスが無ければ断る', async () => {
    const useCase = spyUseCase();

    const response = await readConversation(useCase, { from: 0 });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('sessions.invalid_request');
    expect(useCase.seen, '形が読めないリクエストで内側へ入ってはいけない').toEqual([]);
  });

  it('オブジェクトでないリクエストは断る', async () => {
    const useCase = spyUseCase();

    const response = await readConversation(useCase, ['/nest/s.jsonl']);

    expect(response.ok).toBe(false);
    expect(useCase.seen).toEqual([]);
  });

  /* プロトタイプから生えた欄をリクエストの欄として読むと、送っていない値が届いたことになる。 */
  it('プロトタイプから生えた欄はリクエストの欄ではない', async () => {
    const useCase = spyUseCase();
    const planted = Object.create({ file: '/etc/passwd' }) as Record<string, unknown>;

    const response = await readConversation(useCase, planted);

    expect(response.ok).toBe(false);
    expect(useCase.seen).toEqual([]);
  });

  it('断られたことは HTTP ステータスとして返す', async () => {
    const response = await readConversation(refusing, { file: '/etc/passwd' });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('transcript.out_of_scope');
  });
});
