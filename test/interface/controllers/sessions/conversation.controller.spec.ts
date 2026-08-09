import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import { readConversation } from '~/interface/controllers/sessions/conversation.controller.ts';

/* 届いた求めを、会話への問いとして読めるときだけ受ける。

   境目でしか止められない。内側は読める問いしか受け取らない作りなので、
   形の食い違いはここで断る。 */

/* 相手の形は、検める役自身から引く。ここは内側の名前を見に行けないし、
   写して持てば、形が変わったときに片方だけ古いまま残る。 */
type ReadConversationUseCase = Parameters<typeof readConversation>[0];
type ConversationRequest = Parameters<ReadConversationUseCase['execute']>[0];

/** 断りの偽物。名札だけが同じであればよく、内側の型は要らない */
class OutOfScope extends AppError {
  readonly code = 'transcript.out_of_scope';
}

/** 内側へ渡った問いを控える偽の求め */
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
    return err(new OutOfScope('観測していない正本を開こうとした'));
  },
};

describe('会話の求めを検める', () => {
  it('在り処と位置をそのまま渡す', async () => {
    const useCase = spyUseCase();

    const response = await readConversation(useCase, { file: '/nest/s.jsonl', from: 10, to: 20 });

    expect(response.ok).toBe(true);
    expect(useCase.seen).toEqual([{ file: '/nest/s.jsonl', from: 10, to: 20 }]);
  });

  /* 旧実装は `-1` を「末尾から」の合図に使っていた。負の数をここで受けておかないと、
     古いしおりが黙って先頭から読み直される。 */
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

  it('在り処が無ければ断る', async () => {
    const useCase = spyUseCase();

    const response = await readConversation(useCase, { from: 0 });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('sessions.invalid_request');
    expect(useCase.seen, '形が読めない求めで内側へ入ってはいけない').toEqual([]);
  });

  it('記録でない求めは断る', async () => {
    const useCase = spyUseCase();

    const response = await readConversation(useCase, ['/nest/s.jsonl']);

    expect(response.ok).toBe(false);
    expect(useCase.seen).toEqual([]);
  });

  /* 土台から生えた欄を求めの欄として読むと、送っていない値が届いたことになる。 */
  it('土台から生えた欄は求めの欄ではない', async () => {
    const useCase = spyUseCase();
    const planted = Object.create({ file: '/etc/passwd' }) as Record<string, unknown>;

    const response = await readConversation(useCase, planted);

    expect(response.ok).toBe(false);
    expect(useCase.seen).toEqual([]);
  });

  it('断られたことは番号として返す', async () => {
    const response = await readConversation(refusing, { file: '/etc/passwd' });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('transcript.out_of_scope');
  });
});
