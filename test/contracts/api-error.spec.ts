/* 名札と番号の対応。**層に紐づかない契約なので、鏡像の外に置いてある。**

   表に並ぶ名札は、実際の誤りの類から取る。字で書き写すと、名札を変えた日に
   表だけが古いまま残り、知らない名札として 503(もう一度どうぞ)へ静かに倒れる。
   そのために全ての層の誤りを見に行く — 鏡像の中では引けない道である。 */

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

/** 表に載っていない名札を持つ誤り */
class UnknownError extends AppError {
  readonly code = 'nobody.knows';
}

/* 名札は実物の誤りから取る。**字を書き写すと、検査が表を写しただけになる。**

   写した字どうしを比べても、誤りの側で名札が変わったことは分からない。実物を通せば、
   名札を変えた瞬間にここが落ちて、表を直し忘れたことに気づける。 */
const CASES: [AppError, ApiStatus, 'invalid' | 'unobservable'][] = [
  [new InvalidPathError('場所として使えない'), 400, 'invalid'],
  [new OutOfScopePathError('外を指している'), 403, 'invalid'],
  [new PreferencesRefusedError('観測元の中には書かない'), 403, 'invalid'],
  [new TranscriptOutOfScopeError('観測していない正本'), 403, 'invalid'],
  [new ProjectNotObservedError('知らない巣'), 404, 'invalid'],
  [new SessionNotObservedError('知らないセッション'), 404, 'invalid'],
  [new UnexpectedError('壊れた'), 500, 'unobservable'],
  [new TranscriptReadError('読めない'), 503, 'unobservable'],
  [new LedgerReadError('台帳を読めない'), 503, 'unobservable'],
  [new ProcessInspectionError('数えられない'), 503, 'unobservable'],
  [new TranscriptWatchError('張れない'), 503, 'unobservable'],
  [new PreferencesReadError('覚え書きを読めない'), 503, 'unobservable'],
  [new PreferencesWriteError('覚え書きを置けない'), 503, 'unobservable'],
];

describe('名札から番号へ', () => {
  for (const [error, status] of CASES) {
    it(`${error.code} は ${status}`, () => {
      expect(
        statusForCode(error.code),
        '番号の写し方が変わると、受け取る側の再試行の判断まで変わる',
      ).toBe(status);
    });
  }

  it('知らない名札は 503 に倒す', () => {
    expect(
      statusForCode('nobody.knows'),
      '想定できていない誤りを 400 番台にすると、落ち度の無い求め手を責めることになる',
    ).toBe(503);
  });

  it('空の名札も 503 に倒す', () => {
    expect(statusForCode(''), '名札が無いことも「知らない名札」の一つである').toBe(503);
  });

  it('土台から生えてくる名前も 503 に倒す', () => {
    /* 表を素で索くと、載せた覚えの無い名前が値を持って返ってくる。
       番号でないものが番号として外へ出ると、返しの組み立てがそこで壊れる。 */
    for (const forged of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(statusForCode(forged), `${forged} は表に載せた名札ではない`).toBe(503);
    }
  });

  it('説明の付かない誤りは 503 ではなく 500', () => {
    expect(
      statusForCode('unexpected'),
      '503 は「もう一度求めれば通るかもしれない」の意味で、こちらの穴に言えば直らない求めを永久に叩かせる',
    ).toBe(500);
  });
});

describe('番号と言い分は必ず揃う', () => {
  for (const [error, status, state] of CASES) {
    it(`${error.code} は ${status} と ${state}`, () => {
      expect(
        presentError(error),
        '番号と言い分が食い違うと、受け取る側はどちらを信じてよいか決められない',
      ).toEqual({
        status,
        body: { state, code: error.code, message: error.message },
      });
    });
  }
});

describe('外へ返す形', () => {
  it('求めの側の誤りは invalid と名乗る', () => {
    const presented = presentError(new OutOfScopePathError('外を指している'));
    expect(presented.status, '読んでよい場所の外は断る').toBe(403);
    expect(presented.body, '見に行けなかったのではなく、行かないと決めたのである').toEqual({
      state: 'invalid',
      code: 'workspace.out_of_scope',
      message: '外を指している',
    });
  });

  it('知らない名札も形は同じ', () => {
    const presented = presentError(new UnknownError('知らない'));
    expect(presented.status, '想定できていない誤りは見に行けなかった扱いにする').toBe(503);
    expect(presented.body.state, '番号と言い分が食い違うと、受け取る側が迷う').toBe('unobservable');
  });

  it('名札はそのまま外へ出す', () => {
    expect(
      presentError(new UnexpectedError('何か')).body.code,
      '番号だけでは何が起きたか分からない。名札は版を跨いで変わらない目印である',
    ).toBe('unexpected');
  });

  it('外へ出す欄はこの 3 つだけ', () => {
    expect(
      Object.keys(
        presentError(new TranscriptReadError('読めない', { details: { code: 'EACCES' } })),
      ),
      '包みに欄を足すと、受け取る側が形を二通り覚えることになる',
    ).toEqual(['status', 'body']);
    expect(
      Object.keys(
        presentError(new TranscriptReadError('読めない', { details: { code: 'EACCES' } })).body,
      ),
      'errno のような内側の字は外へ出さない',
    ).toEqual(['state', 'code', 'message']);
  });
});
