import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import {
  readPreferences,
  writePreferences,
} from '~/interface/controllers/workspace/preferences.controller.ts';

/** 断りの偽物。エラーコードだけが同じであればよく、保存先の側の型は要らない */
class RefusedError extends AppError {
  readonly code = 'preferences.refused';
}

/** スナップショットを起こせなかったときのエラー。観測できなかった側のエラーコードを使う */
class TreeError extends AppError {
  readonly code = 'transcript.unreadable';
}

/* 偽物の形は、コントローラーが受け取る形から取る。**型を書き写すと、内側の形が変わっても気づけない。** */
type Deps = Parameters<typeof writePreferences>[0];
type Snapshot = Extract<Awaited<ReturnType<Deps['index']['get']>>, { ok: true }>['value'];
type Stub = Snapshot['index']['stubs'][number];
type WriteInput = Parameters<Deps['write']['execute']>[0];
type View = Awaited<ReturnType<Deps['read']['execute']>>;

const WATCHED: View['watched'] = { version: 2, paths: ['/w/a'] };

const VIEW: View = {
  watched: WATCHED,
  visibleTabs: ['-w-a'],
  locale: null,
  stored: observed(WATCHED),
};

const project = (id: string, canonicalPath: string | null): Stub => ({
  id,
  slugs: [id],
  path: canonicalPath,
  canonicalPath,
  name: id,
  liveProcessCount: 0,
  latestActivityMs: 0,
  transcriptCount: 0,
  walked: observed(0),
});

/* 索引の偽物。触られたかどうかが分かるよう、覗いた回数を数える。

   **見るのは索引であって木ではない。** 木に居るのは観ると決めたものだけなので、
   まだ記録していないディレクトリは木から起こせない。 */
function fakeIndex(stubs: readonly Stub[] = [], watched?: readonly string[]) {
  let looks = 0;
  const service: Deps['index'] = {
    async get() {
      looks += 1;
      return ok({
        index: {
          generatedAtMs: 0,
          activeThresholdMs: 60_000,
          sources: observed(stubs.length),
          processes: observed(0),
          stubs,
        },
        watchedIds: new Set(watched ?? stubs.map((stub) => stub.id)),
        transcriptFiles: new Set<string>(),
        groups: [],
      });
    },
    invalidate() {},
  };
  return { service, lookCount: () => looks };
}

/** 索引を起こせない偽物。材料が欠けたときに何が起きるかを見るために要る */
function blindIndex() {
  const service: Deps['index'] = {
    async get() {
      return err(new TreeError('`transcript` のルートを読めなかった'));
    },
    invalidate() {},
  };
  return { service, lookCount: () => 1 };
}

/** 内側の偽物。渡された入力を覚え、返す結果を差し替えられる */
function fakeUseCases(options: { refuse?: boolean } = {}) {
  const inputs: WriteInput[] = [];
  const read: Deps['read'] = {
    async execute({ observed: rows }) {
      return { ...VIEW, visibleTabs: rows.map((row) => row.id) };
    },
  };
  const write: Deps['write'] = {
    async execute(input) {
      inputs.push(input);
      if (options.refuse === true) return err(new RefusedError('観測元の中には書かない'));
      return ok(VIEW);
    },
  };
  return { read, write, inputs };
}

/** 覚えている観測を捨てにきた回数。捨てたかどうかは、外から数えるほかない */
function fakeRefresh() {
  let drops = 0;
  return {
    refresh: () => {
      drops += 1;
    },
    dropCount: () => drops,
  };
}

const deps = (
  index: ReturnType<typeof fakeIndex>,
  cases: ReturnType<typeof fakeUseCases>,
  refresh: ReturnType<typeof fakeRefresh> = fakeRefresh(),
): Deps => ({
  read: cases.read,
  write: cases.write,
  index: index.service,
  refresh: refresh.refresh,
});

describe('操作を受けるコントローラー', () => {
  it('観ると決める操作を、そのまま内側へ渡す', async () => {
    const index = fakeIndex([project('-w-a', '/w/a'), project('-w-b', null)]);
    const cases = fakeUseCases();

    const response = await writePreferences(deps(index, cases), {
      action: 'watch',
      id: '-w-a',
    });

    expect(cases.inputs[0]?.action, 'コントローラーは操作を読み替えない').toEqual({
      action: 'watch',
      id: '-w-a',
    });
    expect(
      cases.inputs[0]?.observed.map((row) => row.id),
      '出す対象と、id からパスへの読み替えの材料は、いまのスナップショットから起こす',
    ).toEqual(['-w-a']);
    expect(
      cases.inputs[0]?.observedRoots,
      'パスの分からないプロジェクトは書き先の判定に使えない。渡しても意味が無いので落とす',
    ).toEqual(['/w/a']);
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('断られた');
    expect(response.body.watched).toEqual(['/w/a']);
  });

  it('並べ替えの落とし先も、そのまま渡す', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();

    await writePreferences(deps(index, cases), {
      action: 'move',
      id: '-w-a',
      toIndex: 2,
    });

    expect(cases.inputs[0]?.action).toEqual({
      action: 'move',
      id: '-w-a',
      toIndex: 2,
    });
  });

  /* 言葉の選択には相手の id が要らない。**知らない綴りは断る** —— 既定へ倒して受けると、
     送り間違いが「英語を選んだ」として `preferences.json` に残る。 */
  it('言葉を選ぶ操作を、そのまま内側へ渡す', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(index, cases), {
      action: 'locale',
      locale: 'zh-Hant',
    });

    expect(cases.inputs[0]?.action).toEqual({ action: 'locale', locale: 'zh-Hant' });
    expect(response.ok).toBe(true);
  });

  /* `null` は英語ではなく「選ぶのをやめる」である。断ると、一度選んだ人は
     ブラウザーの言葉へ戻れなくなる。 */
  it('言葉を選ぶのをやめる操作も受ける', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(index, cases), {
      action: 'locale',
      locale: null,
    });

    expect(cases.inputs[0]?.action).toEqual({ action: 'locale', locale: null });
    expect(response.ok, '戻す先が無いと、一度選んだ人はブラウザーの言葉へ戻れない').toBe(true);
  });

  it('外すという操作も受ける', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();

    await writePreferences(deps(index, cases), { action: 'unwatch', id: '-w-a' });

    expect(cases.inputs[0]?.action).toEqual({ action: 'unwatch', id: '-w-a' });
  });

  /* 観る相手が変わると、読む範囲そのものが変わる。捨てないと、置いた直後に取り直した画面が
     変える前の 1 枚を受け取り、観ると決めたプロジェクトがタブにも一覧にも出ない。 */
  it('観ると決めたら、覚えている観測を捨てる', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();
    const refresh = fakeRefresh();

    await writePreferences(deps(index, cases, refresh), { action: 'watch', id: '-w-a' });

    expect(refresh.dropCount(), '置いた直後の取り直しに、変える前の 1 枚を返さない').toBe(1);
  });

  it('観るのをやめたときも、覚えている観測を捨てる', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();
    const refresh = fakeRefresh();

    await writePreferences(deps(index, cases, refresh), { action: 'unwatch', id: '-w-a' });

    expect(refresh.dropCount(), '外したプロジェクトが、次の走査まで一覧に残る').toBe(1);
  });

  /* 並べ替えはタブの順だけの話で、読む範囲は 1 つも動いていない。捨てると、掴んで動かす
     たびに `~/.claude/projects` を走査し直すことになる。 */
  it('並べ替えでは、覚えている観測を捨てない', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();
    const refresh = fakeRefresh();

    await writePreferences(deps(index, cases, refresh), {
      action: 'move',
      id: '-w-a',
      toIndex: 0,
    });

    expect(refresh.dropCount(), '順を変えただけで走査をやり直す理由が無い').toBe(0);
  });

  it('言葉を選んだだけでは、覚えている観測を捨てない', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();
    const refresh = fakeRefresh();

    await writePreferences(deps(index, cases, refresh), { action: 'locale', locale: 'ja' });

    expect(refresh.dropCount(), '画面の言葉は、何を読むかを変えない').toBe(0);
  });

  it('置けなかったときは、覚えている観測を捨てない', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases({ refuse: true });
    const refresh = fakeRefresh();

    await writePreferences(deps(index, cases, refresh), { action: 'watch', id: '-w-a' });

    expect(refresh.dropCount(), '記録は 1 つも変わっていないので、捨てるものが無い').toBe(0);
  });

  it('断られたときは、断りとして返す', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases({ refuse: true });

    const response = await writePreferences(deps(index, cases), {
      action: 'watch',
      id: '-w-a',
    });

    expect(
      response.ok,
      '置けなかったのに置けたことにすると、記録が次に開いたとき黙って消える',
    ).toBe(false);
    if (response.ok) throw new Error('通ってしまった');
    expect(response.status, '保存先を変えるまで何度求めても同じで、再試行では通らない').toBe(403);
    expect(response.body).toEqual({
      state: 'invalid',
      code: 'preferences.refused',
      message: '観測元の中には書かない',
    });
  });
});

describe('読めないリクエストは、置きに行く前に断る', () => {
  const BAD: [string, unknown][] = [
    ['組ではない', 'pin'],
    ['何も無い', null],
    ['並び', [{ action: 'watch', id: '-w-a' }]],
    ['どれへの操作か分からない', { action: 'watch' }],
    ['id が文字列でない', { action: 'watch', id: 1 }],
    ['id が空', { action: 'watch', id: '' }],
    ['知らない操作', { action: 'hide', id: '-w-a' }],
    ['丸ごとの差し替え', { version: 1, mode: 'all', pinned: ['-w-a'], hidden: [] }],
    ['落とし先が無い', { action: 'move', id: '-w-a' }],
    ['落とし先が文字列', { action: 'move', id: '-w-a', toIndex: '2' }],
    ['落とし先が無限大', { action: 'move', id: '-w-a', toIndex: Number.POSITIVE_INFINITY }],
    ['落とし先が数でない値', { action: 'move', id: '-w-a', toIndex: Number.NaN }],
    ['出せない言葉', { action: 'locale', locale: 'クリンゴン語' }],
    ['寄せる前のタグ', { action: 'locale', locale: 'ja-JP' }],
    ['言葉が無い', { action: 'locale' }],
    ['言葉が文字列でない', { action: 'locale', locale: 1 }],
  ];

  for (const [name, input] of BAD) {
    it(`${name}: リクエストの側の誤りとして断る`, async () => {
      const index = fakeIndex();
      const cases = fakeUseCases();

      const response = await writePreferences(deps(index, cases), input);

      expect(response.ok).toBe(false);
      if (response.ok) throw new Error('通ってしまった');
      expect(
        response.status,
        '出鱈目を既定と読み替えて置くと、送り間違いが書き換えとして通る',
      ).toBe(400);
      expect(response.body.code).toBe('workspace.invalid_action');
      expect(response.body.state, 'リクエストの側の落ち度である').toBe('invalid');
      expect(cases.inputs, '読めないリクエストで保存先に触らない').toEqual([]);
      expect(index.lookCount(), '読めないリクエストで観測にも触らない').toBe(0);
    });
  }

  it('プロトタイプから生えた欄を、操作の欄として読まない', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();
    const forged = Object.create({ action: 'watch', id: '-w-a' });

    const response = await writePreferences(deps(index, cases), forged);

    expect(response.ok, 'プロトタイプに欄が生えていると、送った覚えのない操作が通る').toBe(false);
    expect(cases.inputs).toEqual([]);
  });

  it('投げずに返す', async () => {
    const index = fakeIndex();
    const cases = fakeUseCases();

    await expect(
      writePreferences(deps(index, cases), Object.create(null)),
      '届いた形が悪いだけで投げると、届け方ひとつで glasshive が止まる',
    ).resolves.toMatchObject({ ok: false });
  });
});

describe('スナップショットを起こせないときは、置きに行かない', () => {
  it('材料が欠けたまま置きに行かず、断りとして返す', async () => {
    const index = blindIndex();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(index, cases), {
      action: 'watch',
      id: '-w-a',
    });

    expect(
      response.ok,
      '書いてよいパスかの材料が欠けたまま置くと、観測したプロジェクトの中へ落ちる',
    ).toBe(false);
    if (response.ok) throw new Error('材料の無いまま置きに行った');
    expect(
      cases.inputs,
      '空の材料に倒して置きに行くと、書き込み先のガードが何も見ないまま通る',
    ).toEqual([]);
    expect(response.status, '観測できなかったのだから、次に求めれば通るかもしれない').toBe(503);
    expect(response.body.code).toBe('transcript.unreadable');
    expect(
      response.body.state,
      'こちらがレスポンスを出せなかったのであって、リクエストの落ち度ではない',
    ).toBe('unobservable');
  });
});

describe('タブの選択を読むコントローラー', () => {
  it('いま観測しているプロジェクトを、突き合わせの材料として渡す', async () => {
    const index = fakeIndex([project('-w-a', '/w/a')]);
    const cases = fakeUseCases();

    const json = await readPreferences(deps(index, cases));

    expect(json.visible_tabs, '出す対象は、いまのスナップショットと突き合わせて決まる').toEqual([
      '-w-a',
    ]);
  });

  /* 読み出しの結果はタブの選択そのもので、断りを載せる欄が無い。だから断りは投げる。
     空のスナップショットへ倒して答えると、観測していないだけのプロジェクトが「消えた」ものとして並ぶ。 */
  it('スナップショットを起こせなければ、空のスナップショットへ倒さず断る', async () => {
    const index = blindIndex();
    const cases = fakeUseCases();

    await expect(readPreferences(deps(index, cases))).rejects.toMatchObject({
      code: 'transcript.unreadable',
    });
  });
});

/* 記録していないディレクトリを選び直すための一覧。

   **画面はパスを名指せない。** 名指せると、開いているどのページも任意のディレクトリを
   glasshive に読ませられる。だから候補は、こちらが見つけたものを id で配る。 */
describe('選び直すための候補', () => {
  it('記録していないものだけを、候補として配る', async () => {
    const index = fakeIndex([project('-w-a', '/w/a'), project('-w-b', '/w/b')], ['-w-a']);
    const cases = fakeUseCases();

    const json = await readPreferences(deps(index, cases));

    expect(json.candidates.map((candidate) => candidate.id)).toEqual(['-w-b']);
    expect(json.candidates[0]?.path, '選ぶ人が見分けられるのは、名前と場所である').toBe('/w/b');
  });

  it('記録したものは、候補から消える', async () => {
    const index = fakeIndex([project('-w-a', '/w/a')]);
    const cases = fakeUseCases();

    const json = await readPreferences(deps(index, cases));

    expect(json.candidates, '記録したものが候補に残ると、二度目を押せてしまう').toEqual([]);
  });
});
