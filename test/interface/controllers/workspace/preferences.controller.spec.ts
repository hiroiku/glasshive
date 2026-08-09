import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import {
  readPreferences,
  writePreferences,
} from '~/interface/controllers/workspace/preferences.controller.ts';

/** 断りの偽物。名札だけが同じであればよく、置き場の側の型は要らない */
class RefusedError extends AppError {
  readonly code = 'preferences.refused';
}

/** 盤面を起こせなかったときの誤り。見に行けなかった側の名札を使う */
class TreeError extends AppError {
  readonly code = 'transcript.unreadable';
}

/* 偽物の形は、窓が受け取る形から取る。**字を書き写すと、内側の形が変わっても気づけない。** */
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
});

/** 盤面の偽物。触られたかどうかが分かるよう、覗いた回数を数える */
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
    invalidate() {},
  };
  return { service, lookCount: () => looks };
}

/** 盤面を起こせない偽物。材料が欠けたときに何が起きるかを見るために要る */
function blindTree() {
  const service: Deps['tree'] = {
    async get() {
      return err(new TreeError('正本の置き場を読めなかった'));
    },
    invalidate() {},
  };
  return { service, lookCount: () => 1 };
}

/** 内側の偽物。渡された申し出を覚え、返す答えを差し替えられる */
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

describe('申し出を受ける窓', () => {
  it('留めるという申し出を、そのまま内側へ渡す', async () => {
    const tree = fakeTree([project('-w-a', '/w/a'), project('-w-b', null)]);
    const cases = fakeUseCases();

    const response = await writePreferences(deps(tree, cases), {
      action: 'pin',
      id: '-w-a',
    });

    expect(cases.inputs[0]?.action, '窓は申し出を読み替えない').toEqual({
      action: 'pin',
      id: '-w-a',
    });
    expect(cases.inputs[0]?.observedIds, '出す対象を決める材料は、いまの盤面から起こす').toEqual([
      '-w-a',
      '-w-b',
    ]);
    expect(
      cases.inputs[0]?.observedRoots,
      '場所の分からない巣は書き先の判定に使えない。渡しても意味が無いので落とす',
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

  it('外すという申し出も受ける', async () => {
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

    expect(response.ok, '置けなかったのに置けたことにすると、印が次に開いたとき黙って消える').toBe(
      false,
    );
    if (response.ok) throw new Error('通ってしまった');
    expect(response.status, '置き場を変えるまで何度求めても同じで、再試行では通らない').toBe(403);
    expect(response.body).toEqual({
      state: 'invalid',
      code: 'preferences.refused',
      message: '観測元の中には書かない',
    });
  });
});

describe('読めない求めは、置きに行く前に断る', () => {
  const BAD: [string, unknown][] = [
    ['組ではない', 'pin'],
    ['何も無い', null],
    ['並び', [{ action: 'pin', id: '-w-a' }]],
    ['どれへの申し出か分からない', { action: 'pin' }],
    ['id が字でない', { action: 'pin', id: 1 }],
    ['id が空', { action: 'pin', id: '' }],
    ['知らない申し出', { action: 'hide', id: '-w-a' }],
    ['丸ごとの差し替え', { version: 1, mode: 'all', pinned: ['-w-a'], hidden: [] }],
    ['落とし先が無い', { action: 'move', id: '-w-a' }],
    ['落とし先が字', { action: 'move', id: '-w-a', toIndex: '2' }],
    ['落とし先が果ての無い数', { action: 'move', id: '-w-a', toIndex: Number.POSITIVE_INFINITY }],
    ['落とし先が数でない値', { action: 'move', id: '-w-a', toIndex: Number.NaN }],
  ];

  for (const [name, input] of BAD) {
    it(`${name}: 求めの側の誤りとして断る`, async () => {
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
      expect(response.body.state, '求めの側の落ち度である').toBe('invalid');
      expect(cases.inputs, '読めない求めで置き場に触らない').toEqual([]);
      expect(tree.lookCount(), '読めない求めで観測にも触らない').toBe(0);
    });
  }

  it('土台から生えた欄を、申し出の欄として読まない', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();
    const forged = Object.create({ action: 'pin', id: '-w-a' });

    const response = await writePreferences(deps(tree, cases), forged);

    expect(response.ok, '土台に欄が生えていると、送った覚えのない申し出が通る').toBe(false);
    expect(cases.inputs).toEqual([]);
  });

  it('投げずに返す', async () => {
    const tree = fakeTree();
    const cases = fakeUseCases();

    await expect(
      writePreferences(deps(tree, cases), Object.create(null)),
      '届いた形が悪いだけで投げると、届け方ひとつで道具が止まる',
    ).resolves.toMatchObject({ ok: false });
  });
});

describe('盤面を起こせない日は、置きに行かない', () => {
  it('材料が欠けたまま置きに行かず、断りとして返す', async () => {
    const tree = blindTree();
    const cases = fakeUseCases();

    const response = await writePreferences(deps(tree, cases), {
      action: 'pin',
      id: '-w-a',
    });

    expect(response.ok, '書いてよい場所かの材料が欠けたまま置くと、観測した巣の中へ落ちる').toBe(
      false,
    );
    if (response.ok) throw new Error('材料の無いまま置きに行った');
    expect(cases.inputs, '空の材料に倒して置きに行くと、見張りが何も見ないまま通る').toEqual([]);
    expect(response.status, '見に行けなかったのだから、次に求めれば通るかもしれない').toBe(503);
    expect(response.body.code).toBe('transcript.unreadable');
    expect(response.body.state, 'こちらが答えを出せなかったのであって、求めの落ち度ではない').toBe(
      'unobservable',
    );
  });
});

describe('選びを読む窓', () => {
  it('いま観測している巣を、突き合わせの材料として渡す', async () => {
    const tree = fakeTree([project('-w-a', '/w/a')]);
    const cases = fakeUseCases();

    const json = await readPreferences(deps(tree, cases));

    expect(json.visible_tabs, '出す対象は、いまの盤面と突き合わせて決まる').toEqual(['-w-a']);
  });

  /* 読む道の答えは選びそのもので、断りを載せる欄が無い。だから断りは投げる。
     空の盤面へ倒して答えると、観測していないだけの巣が「消えた」ものとして並ぶ。 */
  it('盤面を起こせなければ、空の盤面へ倒さず断る', async () => {
    const tree = blindTree();
    const cases = fakeUseCases();

    await expect(readPreferences(deps(tree, cases))).rejects.toMatchObject({
      code: 'transcript.unreadable',
    });
  });
});
