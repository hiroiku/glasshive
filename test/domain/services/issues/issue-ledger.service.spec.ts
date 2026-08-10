import { describe, expect, it } from 'vitest';
import { findIssueRecord, parseLedger } from '~/domain/services/issues/issue-ledger.service.ts';

/** 台帳のテキストを組み立てる。行そのものを渡したいときは文字列のまま混ぜる */
const ledgerOf = (...lines: readonly unknown[]): string =>
  `${lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')}\n`;

/* 閉じた課題は一覧から落とすが件数には出す、一覧に本文は載せない。
   台帳の読み取りで動かしてはいけない 3 点を、この 1 つの入力で固定する。 */
const CONTRACT = ledgerOf(
  {
    _type: 'issue',
    id: 'x-1',
    title: '生きている',
    status: 'open',
    priority: 1,
    updated_at: '2026-08-04T00:00:00Z',
  },
  {
    _type: 'issue',
    id: 'x-2',
    title: '作業中',
    status: 'in_progress',
    assignee: 'mgr-deadbeef',
  },
  {
    _type: 'issue',
    id: 'x-3',
    title: '済み',
    status: 'closed',
    description: '巨大な本文',
  },
);

describe('台帳を一覧にする', () => {
  it('閉じた課題は一覧から落とすが、件数には数える', () => {
    const ledger = parseLedger(CONTRACT, { includeClosed: false });

    expect(
      ledger.issues.map((issue) => issue.id),
      '閉じたものだけが一覧から消える',
    ).toEqual(['x-1', 'x-2']);
    expect(
      ledger.counts.closed,
      '隠しても「いくつ閉じたか」は見せる。数えるより先に落とすと、この件数が消える',
    ).toBe(1);
    expect(ledger.counts.open).toBe(1);
    expect(ledger.counts.in_progress).toBe(1);
  });

  it('求められれば閉じた課題も一覧に載せる', () => {
    const ledger = parseLedger(CONTRACT, { includeClosed: true });
    expect(
      ledger.issues.map((issue) => issue.id),
      '件数の側は `includeClosed` で変わらない',
    ).toEqual(['x-1', 'x-2', 'x-3']);
    expect(ledger.counts).toEqual({ open: 1, in_progress: 1, closed: 1 });
  });

  it('一覧に本文を載せない', () => {
    const ledger = parseLedger(CONTRACT, { includeClosed: true });
    const closed = ledger.issues.find((issue) => issue.id === 'x-3');
    /* 見付からないまま先へ進むと、`Object.hasOwn({}, ...)` が偽になるだけでテストが通る。
       本文を落としたのか、課題ごと落としたのかが見分けられなくなるので、ここで止める。 */
    if (closed === undefined) throw new Error('本文を持つ課題が一覧に居ない');
    expect(
      Object.hasOwn(closed, 'description'),
      '本文は際限なく大きくなる。数百件ぶんを一度に運ぶと一覧そのものが開かなくなる',
    ).toBe(false);
    expect(ledger.issues[1]?.assignee, '一覧に要る欄は落とさない').toBe('mgr-deadbeef');
  });

  it('欄の名は内側の書き方に正規化する', () => {
    const ledger = parseLedger(
      ledgerOf({
        _type: 'issue',
        id: 'x-1',
        status: 'open',
        issue_type: 'bug',
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-02T00:00:00Z',
        labels: ['ui', 'p1'],
        owner: 'hiroiku',
      }),
      { includeClosed: false },
    );
    expect(ledger.issues[0], '外の名前を内側まで持ち込むと、写す場所が散る').toMatchObject({
      issueType: 'bug',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
      labels: ['ui', 'p1'],
      owner: 'hiroiku',
    });
  });

  it('課題でない記録は落とす', () => {
    const ledger = parseLedger(
      ledgerOf(
        { _type: 'issue', id: 'x-1', status: 'open' },
        { _type: 'meta', version: 3, status: 'open' },
        { _type: null, id: 'x-9', status: 'open' },
      ),
      { includeClosed: false },
    );
    expect(
      ledger.issues.map((issue) => issue.id),
      '台帳には課題以外の記録も混ざる',
    ).toEqual(['x-1']);
    expect(ledger.counts, '課題でない記録は件数にも出さない').toEqual({
      open: 1,
    });
  });

  it('種別の欄が無い行は課題として読む', () => {
    const ledger = parseLedger(ledgerOf({ id: 'x-1', status: 'open' }), {
      includeClosed: false,
    });
    expect(
      ledger.issues.map((issue) => issue.id),
      '古い書き出しには `_type` が付いていない',
    ).toEqual(['x-1']);
  });

  it('壊れた行は飛ばして、その先を読む', () => {
    const ledger = parseLedger(
      ledgerOf({ _type: 'issue', id: 'x-1', status: 'open' }, '{途中で切れて', {
        _type: 'issue',
        id: 'x-2',
        status: 'open',
      }),
      { includeClosed: false },
    );
    expect(
      ledger.issues.map((issue) => issue.id),
      '1 行の壊れで一覧ぜんぶを失うほうが、はるかに大きな嘘になる',
    ).toEqual(['x-1', 'x-2']);
  });

  it('裸の値の行は課題にならないし、数えもしない', () => {
    const ledger = parseLedger(
      ledgerOf('5', '"x"', 'null', 'true', '[1,2]', {
        _type: 'issue',
        id: 'x-1',
        status: 'open',
      }),
      { includeClosed: false },
    );
    expect(
      ledger.issues.map((issue) => issue.id),
      '欄が全部空の課題として並べると、ユーザーには読めなかった行と見分けが付かない',
    ).toEqual(['x-1']);
    expect(ledger.counts, '記録でない行を数えると、件数の合計が課題の数と合わなくなる').toEqual({
      open: 1,
    });
  });

  it('状態の書かれていない課題は、空の状態として数える', () => {
    const ledger = parseLedger(
      ledgerOf({ _type: 'issue', id: 'x-1' }, { _type: 'issue', id: 'x-2', status: 5 }),
      {
        includeClosed: false,
      },
    );
    expect(
      ledger.issues.map((issue) => issue.status),
      '状態は必ず文字列。集計のキーを 2 種類にしない',
    ).toEqual(['', '']);
    expect(ledger.counts).toEqual({ '': 2 });
  });

  it('依存を、掛かっている先と種類に写す', () => {
    const ledger = parseLedger(
      ledgerOf({
        _type: 'issue',
        id: 'x-1',
        status: 'open',
        dependencies: [
          {
            issue_id: 'x-1',
            depends_on_id: 'x-0',
            type: 'blocks',
            metadata: '{}',
          },
          { issue_id: 'x-1', type: 'parent-child' },
        ],
      }),
      { includeClosed: false },
    );
    expect(ledger.issues[0]?.deps, '台帳の欄名は外の書き方。内側では向きの分かる名にする').toEqual([
      { on: 'x-0', type: 'blocks' },
      { on: null, type: 'parent-child' },
    ]);
  });

  it('依存が配列でなければ、依存は無い', () => {
    const ledger = parseLedger(
      ledgerOf(
        { _type: 'issue', id: 'x-1', status: 'open' },
        { _type: 'issue', id: 'x-2', status: 'open', dependencies: 'x-1' },
      ),
      { includeClosed: false },
    );
    expect(
      ledger.issues.map((issue) => issue.deps),
      '依存の無い課題と、依存の書き方が違う課題は、どちらも辿れない',
    ).toEqual([[], []]);
  });

  it('型の合わない欄は、書かれていないものとして扱う', () => {
    const ledger = parseLedger(
      ledgerOf({
        _type: 'issue',
        id: 'x-1',
        status: 'open',
        priority: '高い',
        labels: 'ui',
        title: 42,
      }),
      { includeClosed: false },
    );
    const issue = ledger.issues[0];
    expect(issue?.priority, '文字列を数として並べ替えると、順序が黙って崩れる').toBe(null);
    expect(issue?.labels, 'ラベルのチップは配列でしか描けない').toBe(null);
    expect(issue?.title).toBe(null);
  });

  it('優先度の 0 は「無い」ではない', () => {
    const ledger = parseLedger(
      ledgerOf({ _type: 'issue', id: 'x-1', status: 'open', priority: 0 }),
      {
        includeClosed: false,
      },
    );
    expect(ledger.issues[0]?.priority, '0 は最も高い優先度。書かれていないことと潰さない').toBe(0);
  });

  it('継いだ名前と同じ状態でも、数は数のまま数える', () => {
    const ledger = parseLedger(
      ledgerOf(
        { _type: 'issue', id: 'x-1', status: '__proto__' },
        { _type: 'issue', id: 'x-2', status: 'constructor' },
        { _type: 'issue', id: 'x-3', status: 'toString' },
        { _type: 'issue', id: 'x-4', status: 'constructor' },
      ),
      { includeClosed: false },
    );

    /* 待つ側を素の `{ __proto__: 1 }` で書いてはいけない。書き方そのものが親の付け替えに
       化けて欄が消え、実物が正しくても落ちる。だから欄の並びで待つ。 */
    expect(
      Object.entries(ledger.counts).sort(),
      '状態の文字列を決めるのは台帳であって、こちらではない',
    ).toEqual([
      ['__proto__', 1],
      ['constructor', 2],
      ['toString', 1],
    ]);
    for (const [status, count] of Object.entries(ledger.counts)) {
      expect(typeof count, `${status} の数が数でなくなっている`).toBe('number');
    }
    expect(
      Object.values(ledger.counts).reduce((sum, count) => sum + count, 0),
      '一覧に並んでいる課題が件数から消えると、いくつ在るのかを誰も言えなくなる',
    ).toBe(ledger.issues.length);
  });

  it('空の台帳は、課題も件数も空', () => {
    expect(parseLedger('', { includeClosed: false })).toEqual({
      issues: [],
      counts: {},
    });
  });
});

describe('台帳から 1 件を引く', () => {
  const LEDGER = ledgerOf(
    {
      _type: 'issue',
      id: 'x-1',
      status: 'open',
      title: '一つめ',
      description: '巨大な本文',
    },
    { _type: 'issue', id: 'x-2', status: 'closed', title: '"x-1" のこと' },
  );

  it('台帳に書かれていた欄をぜんぶ返す', () => {
    expect(
      findIssueRecord(LEDGER, 'x-1'),
      '一覧が本文を落とすのは大きさのためで、持っていないからではない',
    ).toEqual({
      _type: 'issue',
      id: 'x-1',
      status: 'open',
      title: '一つめ',
      description: '巨大な本文',
    });
  });

  it('閉じた課題も引ける', () => {
    expect(findIssueRecord(LEDGER, 'x-2')?.id, '一覧から落とすのと、引けないのは別の話').toBe(
      'x-2',
    );
  });

  it('見付からなければ投げずに無いと答える', () => {
    expect(
      findIssueRecord(LEDGER, 'x-9'),
      '無いことは観測できた事実である。投げて止めるようなものではない',
    ).toBe(null);
  });

  it('id が本文に現れるだけの行は返さない', () => {
    const ledger = ledgerOf(
      { _type: 'issue', id: 'x-2', status: 'open', title: '"x-1" のこと' },
      { _type: 'issue', id: 'x-1', status: 'open', title: 'こちらが本人' },
    );
    expect(
      findIssueRecord(ledger, 'x-1')?.title,
      'id の文字列を含む行だけをパースするのは速さのため。当たりの判定は `id` の欄で決める',
    ).toBe('こちらが本人');
  });

  it('課題でない記録は返さない', () => {
    const ledger = ledgerOf(
      { _type: 'meta', id: 'x-1', note: '課題ではない' },
      { _type: 'issue', id: 'x-1', status: 'open', title: 'こちらが課題' },
    );
    expect(findIssueRecord(ledger, 'x-1')?.title).toBe('こちらが課題');
  });

  it('壊れた行に id が載っていても、その先を読み続ける', () => {
    const ledger = ledgerOf('{"id":"x-1","status":"op', {
      _type: 'issue',
      id: 'x-1',
      status: 'open',
    });
    expect(findIssueRecord(ledger, 'x-1')?.status, '壊れた 1 行で 1 件ぜんぶを失わない').toBe(
      'open',
    );
  });
});
