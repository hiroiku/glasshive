import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import { readTree } from '~/interface/controllers/sessions/tree.controller.ts';

/* コントローラーが持つのは、受理と不受理の分かれ目だけである。
   テストで共有する形は、コントローラー自身から引く。 */

type Snapshot = Parameters<typeof readTree>[0];
type Answer = Awaited<ReturnType<Snapshot['get']>>;
type Tree = Extract<Answer, { ok: true }>['value'];

class RefusedError extends AppError {
  readonly code = 'test.refused';
}

const TREE: Tree = {
  generatedAtMs: Date.parse('2026-08-04T00:00:00.000Z'),
  activeThresholdMs: 60_000,
  sources: observed(0),
  processes: observed(0),
  projects: [],
};

const snapshotOf = (answer: Answer): Snapshot => ({
  get: async () => answer,
  invalidate: () => {},
});

describe('木を返すコントローラー', () => {
  it('受理されたリクエストは、外部 API の形に写して返す', async () => {
    expect(await readTree(snapshotOf(ok(TREE)))).toEqual(
      expect.objectContaining({
        generated_at: '2026-08-04T00:00:00Z',
        projects: [],
      }),
    );
  });

  it('断りは、値のまま外へ流さない', async () => {
    const refused = new RefusedError('受けられないリクエストだった');

    await expect(
      readTree(snapshotOf(err(refused))),
      '値のまま流すと、HTTP ステータスに写すプレゼンターを通らずに 200 で出てしまう',
    ).rejects.toBe(refused);
  });
});
