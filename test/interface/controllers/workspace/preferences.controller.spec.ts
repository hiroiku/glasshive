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
type Snapshot = Extract<Awaited<ReturnType<Deps['tree']['get']>>, { ok: true }>['value'];
type WriteInput = Parameters<Deps['write']['execute']>[0];
type View = Awaited<ReturnType<Deps['read']['execute']>>;

const SELECTION: View['selection'] = {
  version: 1,
  mode: 'all',
  pinned: ['-w-a'],
  hidden: [],
};

const VIEW: View = {
  selection: SELECTION,
  visibleTabs: ['-w-a'],
  locale: null,
  stored: observed(SELECTION),
};

const project = (id: string, canonicalPath: string | null): Snapshot['projects'][number] => ({
  id,
  slugs: [id],
  path: canonicalPath,
  canonicalPath,
  name: id,
  liveProcessCount: 0,
  sessions: [],
  latestActivityMs: 0,
  recentTokens: observed(0),
  walked: observed(0),
});

/* 木 1 枚から、本物と同じ順に配る索引のチャンクを起こす。
   本物も索引を先に配るので、偽物もその順を守っておく。 */
const indexChunkOf = (tree: Snapshot) =>
  ({
    kind: 'index' as const,
    index: {
      generatedAtMs: tree.generatedAtMs,
      activeThresholdMs: tree.activeThresholdMs,
      sources: tree.sources,
      processes: tree.processes,
      stubs: [],
    },
  }) as const;

/** スナップショットの偽物。触られたかどうかが分かるよう、覗いた回数を数える */
function fakeTree(projects: readonly Snapshot['projects'][number][] = []) {
  let looks = 0;
  const service: Deps['tree'] = {
    async get() {
      looks += 1;
      return ok({
        generatedAtMs: 0,
        activeThresholdMs: 60_000,
        sources: observed(projects.length),
        processes: observed(0),
        projects,
      });
    },
    // この controller が見るのは `get` だけである。`stream` は形を満たすためだけに置く
    async *stream() {
      const answer = await service.get();
      if (answer.ok) yield indexChunkOf(answer.value);
      return answer;
    },
    invalidate() {},
  };
  return { service, lookCount: () => looks };
}

/** スナップショットを起こせない偽物。材料が欠けたときに何が起きるかを見るために要る */
function blindTree() {
  const service: Deps['tree'] = {
    async get() {
      return err(new TreeError('`transcript` のルートを読めなかった'));
    },
    // この controller が見るのは `get` だけである。`stream` は形を満たすためだけに置く
    // biome-ignore lint/correctness/useYield: 木を起こせない偽物なので、配るものが 1 つも無い
    async *stream() {
      return await service.get();
    },
    invalidate() {},
  };
  return { service, lookCount: () => 1 };
}

/** 内側の偽物。渡された入力を覚え、返す結果を差し替えられる */
function fakeUseCases(options: { refuse?: boolean } = {}) {
  const inputs: WriteInput[] = [];
  const read: Deps['read'] = {
    async execute(observedIds) {
      return { ...VIEW, visibleTabs: [...observedIds] };
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

const deps = (tree: ReturnType<typeof fakeTree>, cases: ReturnType<typeof fakeUseCases>): Deps => ({
  read: cases.read,
  write: cases.write,
  tree: tree.service,
});

describe('操作を受けるコントローラー', () => {
  it('留めるという操作を、そのまま内側へ渡す', async () => {
    const tree = fakeTree([project('-w-a', '/w/a'), project('-w-b', null)]);
    const cases = fakeUseCases();

    const response = await writePreferences(deps(tree, cases), {
      action: 'pin',
      id: '-w-a',
    });

    expect(cases.inputs[0]?.action, 'コントローラーは操作を読み替えない').toEqual({
      action: 'pin',
      id: '-w-a',
    });
    expect(
      cases.inputs[0]?.observedIds,
      '出す対象を決める材料は、いまのスナップショットから起こす',
    ).toEqual(['-w-a', '-w-b']);
    expect(
      cases.inputs[0]?.observedRoots,
      'パスの分からないプロジェクトは書き先の判定に使えない。渡しても意味が無いので落とす',
    ).toEqual(['/w/a']);
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('断られた');
    expect(response.body.tab_selection.pinned).toEqual(['-w-a']);
  });

  it('並べ替えの落とし先も、そのまま渡す', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();

    await writePreferences(deps(tree, cases), {
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
    const tree = fakeTree();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(tree, cases), {
      action: 'locale',
      locale: 'zh-Hant',
    });

    expect(cases.inputs[0]?.action).toEqual({ action: 'locale', locale: 'zh-Hant' });
    expect(response.ok).toBe(true);
  });

  /* `null` は英語ではなく「選ぶのをやめる」である。断ると、一度選んだ人は
     ブラウザーの言葉へ戻れなくなる。 */
  it('言葉を選ぶのをやめる操作も受ける', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(tree, cases), {
      action: 'locale',
      locale: null,
    });

    expect(cases.inputs[0]?.action).toEqual({ action: 'locale', locale: null });
    expect(response.ok, '戻す先が無いと、一度選んだ人はブラウザーの言葉へ戻れない').toBe(true);
  });

  it('外すという操作も受ける', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();

    await writePreferences(deps(tree, cases), { action: 'unpin', id: '-w-a' });

    expect(cases.inputs[0]?.action).toEqual({ action: 'unpin', id: '-w-a' });
  });

  it('断られたときは、断りとして返す', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases({ refuse: true });

    const response = await writePreferences(deps(tree, cases), {
      action: 'pin',
      id: '-w-a',
    });

    expect(
      response.ok,
      '置けなかったのに置けたことにすると、ピン留めが次に開いたとき黙って消える',
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
    ['並び', [{ action: 'pin', id: '-w-a' }]],
    ['どれへの操作か分からない', { action: 'pin' }],
    ['id が文字列でない', { action: 'pin', id: 1 }],
    ['id が空', { action: 'pin', id: '' }],
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
      const tree = fakeTree();
      const cases = fakeUseCases();

      const response = await writePreferences(deps(tree, cases), input);

      expect(response.ok).toBe(false);
      if (response.ok) throw new Error('通ってしまった');
      expect(
        response.status,
        '出鱈目を既定と読み替えて置くと、送り間違いが書き換えとして通る',
      ).toBe(400);
      expect(response.body.code).toBe('workspace.invalid_action');
      expect(response.body.state, 'リクエストの側の落ち度である').toBe('invalid');
      expect(cases.inputs, '読めないリクエストで保存先に触らない').toEqual([]);
      expect(tree.lookCount(), '読めないリクエストで観測にも触らない').toBe(0);
    });
  }

  it('プロトタイプから生えた欄を、操作の欄として読まない', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();
    const forged = Object.create({ action: 'pin', id: '-w-a' });

    const response = await writePreferences(deps(tree, cases), forged);

    expect(response.ok, 'プロトタイプに欄が生えていると、送った覚えのない操作が通る').toBe(false);
    expect(cases.inputs).toEqual([]);
  });

  it('投げずに返す', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();

    await expect(
      writePreferences(deps(tree, cases), Object.create(null)),
      '届いた形が悪いだけで投げると、届け方ひとつで glasshive が止まる',
    ).resolves.toMatchObject({ ok: false });
  });
});

describe('スナップショットを起こせないときは、置きに行かない', () => {
  it('材料が欠けたまま置きに行かず、断りとして返す', async () => {
    const tree = blindTree();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(tree, cases), {
      action: 'pin',
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
    const tree = fakeTree([project('-w-a', '/w/a')]);
    const cases = fakeUseCases();

    const json = await readPreferences(deps(tree, cases));

    expect(json.visible_tabs, '出す対象は、いまのスナップショットと突き合わせて決まる').toEqual([
      '-w-a',
    ]);
  });

  /* 読み出しの結果はタブの選択そのもので、断りを載せる欄が無い。だから断りは投げる。
     空のスナップショットへ倒して答えると、観測していないだけのプロジェクトが「消えた」ものとして並ぶ。 */
  it('スナップショットを起こせなければ、空のスナップショットへ倒さず断る', async () => {
    const tree = blindTree();
    const cases = fakeUseCases();

    await expect(readPreferences(deps(tree, cases))).rejects.toMatchObject({
      code: 'transcript.unreadable',
    });
  });
});
