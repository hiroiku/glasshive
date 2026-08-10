/* エラーコードと HTTP ステータスの対応。**層に紐づかない契約なので、`src/` を写した構造の外に置いてある。**

   表に並ぶエラーコードは、実際のエラークラスから取る。文字列で書き写すと、コードを変えた日に
   表だけが古いまま残り、知らないコードとして 503(もう一度どうぞ)へ静かに倒れる。
   そのために全ての層のエラーを見に行く — `src/` を写した構造の中では書けない `import` である。 */

import { describe, expect, it } from 'vitest';
import { AppError, UnexpectedError } from '~/app-kernel/error.ts';
import {
  ProjectNotObservedError,
  SessionNotObservedError,
} from '~/application/errors/sessions/not-observed.error.ts';
import { TranscriptOutOfScopeError } from '~/application/errors/workspace/out-of-scope.error.ts';
import { InvalidPathError, OutOfScopePathError } from '~/domain/errors/workspace/path.error.ts';
import { LedgerReadError } from '~/infrastructure/errors/issues/ledger-read.error.ts';
import {
  ProcessInspectionError,
  TranscriptReadError,
} from '~/infrastructure/errors/sessions/transcript-read.error.ts';
import { TranscriptWatchError } from '~/infrastructure/errors/sessions/transcript-watch.error.ts';
import {
  PreferencesReadError,
  PreferencesRefusedError,
  PreferencesWriteError,
} from '~/infrastructure/errors/workspace/preferences-store.error.ts';
import {
  type ApiStatus,
  presentError,
  statusForCode,
} from '~/interface/presenters/api-error.presenter.ts';

/** 表に載っていないエラーコードを持つエラー */
class UnknownError extends AppError {
  readonly code = 'nobody.knows';
}

/* エラーコードは実物のエラーから取る。**文字列を書き写すと、テストが表を写しただけになる。**

   写した文字列どうしを比べても、エラーの側でコードが変わったことは分からない。実物を通せば、
   コードを変えた瞬間にここが落ちて、表を直し忘れたことに気づける。 */
const CASES: [AppError, ApiStatus, 'invalid' | 'unobservable'][] = [
  [new InvalidPathError('パスとして使えない'), 400, 'invalid'],
  [new OutOfScopePathError('外を指している'), 403, 'invalid'],
  [new PreferencesRefusedError('観測元の中には書かない'), 403, 'invalid'],
  [new TranscriptOutOfScopeError('観測していない `transcript`'), 403, 'invalid'],
  [new ProjectNotObservedError('知らないプロジェクト'), 404, 'invalid'],
  [new SessionNotObservedError('知らないセッション'), 404, 'invalid'],
  [new UnexpectedError('壊れた'), 500, 'unobservable'],
  [new TranscriptReadError('読めない'), 503, 'unobservable'],
  [new LedgerReadError('台帳を読めない'), 503, 'unobservable'],
  [new ProcessInspectionError('数えられない'), 503, 'unobservable'],
  [new TranscriptWatchError('張れない'), 503, 'unobservable'],
  [new PreferencesReadError('`preferences.json` を読めない'), 503, 'unobservable'],
  [new PreferencesWriteError('`preferences.json` を置けない'), 503, 'unobservable'],
];

describe('エラーコードから HTTP ステータスへ', () => {
  for (const [error, status] of CASES) {
    it(`${error.code} は ${status}`, () => {
      expect(
        statusForCode(error.code),
        'HTTP ステータスの割り当てが変わると、受け取る側の再試行の判断まで変わる',
      ).toBe(status);
    });
  }

  it('知らないエラーコードは 503 に倒す', () => {
    expect(
      statusForCode('nobody.knows'),
      '想定できていない誤りを 400 番台にすると、落ち度の無いクライアントを責めることになる',
    ).toBe(503);
  });

  it('空のエラーコードも 503 に倒す', () => {
    expect(statusForCode(''), 'コードが無いことも「知らないエラーコード」の一つである').toBe(503);
  });

  it('プロトタイプから生えてくる名前も 503 に倒す', () => {
    /* 対応表を素で引くと、載せた覚えの無い名前が値を持って返ってくる。
       HTTP ステータスでないものがステータスとして外へ出ると、レスポンスの組み立てがそこで壊れる。 */
    for (const forged of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(statusForCode(forged), `${forged} は表に載せたエラーコードではない`).toBe(503);
    }
  });

  it('説明の付かないエラーは 503 ではなく 500', () => {
    expect(
      statusForCode('unexpected'),
      '503 は「もう一度求めれば通るかもしれない」の意味で、こちらの不具合に使うと直らないリクエストを永久に叩かせる',
    ).toBe(500);
  });
});

describe('HTTP ステータスと state は必ず揃う', () => {
  for (const [error, status, state] of CASES) {
    it(`${error.code} は ${status} と ${state}`, () => {
      expect(
        presentError(error),
        'HTTP ステータスと state が食い違うと、受け取る側はどちらを信じてよいか決められない',
      ).toEqual({
        status,
        body: { state, code: error.code, message: error.message },
      });
    });
  }
});

describe('外へ返す形', () => {
  it('リクエストの側のエラーは invalid になる', () => {
    const presented = presentError(new OutOfScopePathError('外を指している'));
    expect(presented.status, '読んでよいパスの外は断る').toBe(403);
    expect(presented.body, '観測できなかったのではなく、観測しに行かないと決めたのである').toEqual({
      state: 'invalid',
      code: 'workspace.out_of_scope',
      message: '外を指している',
    });
  });

  it('知らないエラーコードも形は同じ', () => {
    const presented = presentError(new UnknownError('知らない'));
    expect(presented.status, '想定できていないエラーは観測できなかった扱いにする').toBe(503);
    expect(presented.body.state, 'HTTP ステータスと state が食い違うと、受け取る側が迷う').toBe(
      'unobservable',
    );
  });

  it('エラーコードはそのまま外へ出す', () => {
    expect(
      presentError(new UnexpectedError('何か')).body.code,
      'HTTP ステータスだけでは何が起きたか分からない。エラーコードはバージョンを跨いで変わらない目印である',
    ).toBe('unexpected');
  });

  it('外へ出す欄はこの 3 つだけ', () => {
    expect(
      Object.keys(
        presentError(new TranscriptReadError('読めない', { details: { code: 'EACCES' } })),
      ),
      '外側のオブジェクトに欄を足すと、受け取る側が形を二通り覚えることになる',
    ).toEqual(['status', 'body']);
    expect(
      Object.keys(
        presentError(new TranscriptReadError('読めない', { details: { code: 'EACCES' } })).body,
      ),
      'errno のような内側の詳細は外へ出さない',
    ).toEqual(['state', 'code', 'message']);
  });
});
