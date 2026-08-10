import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  GIT_EXIT_NONZERO,
  GIT_NOT_INSTALLED,
  type GitCommandIntegration,
  type GitCommandRequest,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import { createConflictCache } from '~/application/services/git/conflict-cache.service.ts';
import {
  createObserveRepository,
  type GitOverview,
  type ObserveRepositoryUseCase,
} from '~/application/use-cases/git/observe-repository.use-case.ts';

/* `git` は起こさない。**尋ねた事柄ごとに出力のテキストを置いて、組み上がりだけを見る。**
   どのテキストがどの導出に効くかはパースのテストで押さえてあるので、ここで見るのは
   「何を尋ねたか」と「起こせなかったときにどう倒れるか」である。 */

/* 尋ねるときに渡す書式と上限。**出力を引くキーになるので、内側の宣言と対で直すこと。**
   食い違うと、この検証は何も引けないまま「組み上がらなかった」とだけ言う。 */
const BRANCH_REF_FORMAT =
  '%(refname:short)%00%(objectname:short)%00%(committerdate:iso-strict)%00%(subject)%00%(HEAD)';
const BRANCH_NAME_FORMAT = '%(refname:short)';
const MAINLINE_FORMAT = '%H%x00%P%x00%cI%x00%s';
const MAINLINE_LIMIT = 120;

class GitFailure extends AppError {
  readonly code: string;

  constructor(code: string) {
    super('テストで起こした失敗');
    this.code = code;
  }
}

const NUL = '\0';
const CWD = '/work/hive';

const WORKTREE_LIST = [
  'worktree /work/hive',
  'HEAD 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
  'branch refs/heads/main',
  '',
  'worktree /work/hive-topic',
  'HEAD 1122334455667788990011223344556677889900',
  'detached',
  '',
].join('\n');

const BRANCH_REFS = [
  ['main', 'abc1234', '2026-08-04T10:00:00+09:00', '土台を置く', '*'].join(NUL),
  ['topic', 'def5678', '2026-08-03T10:00:00+09:00', 'git を移す', ''].join(NUL),
  '',
].join('\n');

const MAINLINE = [
  [
    '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
    '1111111111111111111111111111111111111111',
    '2026-08-04T10:00:00+09:00',
    '土台を置く',
  ].join(NUL),
  '',
].join('\n');

const ANSWERS: Record<string, string> = {
  'worktree list --porcelain': WORKTREE_LIST,
  [`for-each-ref refs/heads --sort=-committerdate --format=${BRANCH_REF_FORMAT}`]: BRANCH_REFS,
  [`log --first-parent -n ${MAINLINE_LIMIT} --format=${MAINLINE_FORMAT} main`]: MAINLINE,
  [`branch --format=${BRANCH_NAME_FORMAT} --no-merged=main`]: 'topic\n',
  'merge-base main topic': '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432\n',
  'rev-list --count main..topic': '3\n',
  'rev-list --count def5678..main': '1\n',
  'merge-base main 1122334455': '1111111111111111111111111111111111111111\n',
  'rev-list --count main..1122334455': '2\n',
  'rev-list --count 1122334455..main': '0\n',
  'diff --name-only main...def5678': 'src/a.ts\nsrc/b.ts\n',
  'diff --name-only main...1122334455': 'src/b.ts\n',
};

const keyOf = (request: GitCommandRequest): string =>
  [...request.args, ...request.revisions.map((revision) => revision.value)].join(' ');

/* 起こした命令の形。繋げて渡した相手は落とす — 相手が何であれ、命令の種類は変わらない。
   **glasshive が書き込む先は `preferences.json` だけである。** 観測元を書き換える種類の命令が
   1 つでも紛れ込めば、読み取り専用ではなくなる。 */
const shapeOf = (request: GitCommandRequest): string =>
  request.args.map((arg) => arg.replace(/=.*$/s, '=')).join(' ');

function fakeGit(overrides: Record<string, Observation<string>> = {}): {
  git: GitCommandIntegration;
  requests: GitCommandRequest[];
} {
  const requests: GitCommandRequest[] = [];
  return {
    requests,
    git: {
      async run(request) {
        requests.push(request);
        const key = keyOf(request);
        return overrides[key] ?? observed(ANSWERS[key] ?? '');
      },
    },
  };
}

const observeOverview = async (overrides?: Record<string, Observation<string>>) =>
  createObserveRepository({ git: fakeGit(overrides).git }).execute(CWD);

type OverviewResult = Awaited<ReturnType<ObserveRepositoryUseCase['execute']>>;

/** 受理された呼び出しだったことを先に言ってから、観測を取り出す */
function observationOf(result: OverviewResult): Observation<GitOverview> {
  expect(result.ok, '断る呼び出しではない。呼び出しの形は正しかった').toBe(true);
  if (!result.ok) throw new Error('断られた');
  return result.value;
}

/* **見えたことを先に言う。** 尋ね方が変わって出力を引けなくなると、glasshive は
   「そこはリポジトリではない」に倒れる。そこで早々に切り上げる書き方をすると、
   検証は何も見ないまま通ってしまう。 */
function observedOverview(result: OverviewResult): GitOverview {
  const observation = observationOf(result);
  expect(observation.kind, '見えるはずのものが見えないなら、その先の確かめに意味は無い').toBe(
    'observed',
  );
  if (observation.kind !== 'observed') throw new Error('観測できていない');
  return observation.value;
}

describe('リポジトリをひと目ぶん観る', () => {
  it('統合のブランチは、主たる `worktree` が出しているブランチ', async () => {
    const overview = observedOverview(await observeOverview());
    expect(overview.base, '縦軸が変わると、生きている線の選び方まで変わる').toBe('main');
  });

  it('生きている線に隔たりを添える', async () => {
    const overview = observedOverview(await observeOverview());
    expect(overview.tips, '線の見え方は、この 3 つの数で決まる').toEqual([
      {
        kind: 'branch',
        name: 'topic',
        sha: 'def5678',
        date: '2026-08-03T10:00:00+09:00',
        subject: 'git を移す',
        worktree: null,
        mergeBase: '9f8e7d6c5b',
        ahead: 3,
        behind: 1,
      },
      {
        kind: 'worktree',
        name: 'hive-topic',
        sha: '1122334455',
        date: null,
        subject: '',
        worktree: '/work/hive-topic',
        mergeBase: '1111111111',
        ahead: 2,
        behind: 0,
      },
    ]);
  });

  it('同じファイルを触っている線の組を添える', async () => {
    const overview = observedOverview(await observeOverview());
    expect(overview.conflicts, '統合の順を決めるための目印である').toEqual([
      { a: 'topic', b: 'hive-topic', count: 1, files: ['src/b.ts'] },
    ]);
  });

  it('本流の節も添える', async () => {
    const overview = observedOverview(await observeOverview());
    expect(
      overview.mainline.map((commit) => commit.sha),
      '縦軸に並ぶ節である',
    ).toEqual(['9f8e7d6c5b']);
  });
});

describe('尋ね方', () => {
  it('revision は語に混ぜず、revision として渡す', async () => {
    const { git, requests } = fakeGit();
    await createObserveRepository({ git }).execute(CWD);
    const mergeBase = requests.find((request) => request.args[0] === 'merge-base');
    expect(
      mergeBase?.args,
      'revision を語に混ぜると、起こす側は打ち切りをどこに置けばよいか分からない',
    ).toEqual(['merge-base']);
    expect(
      mergeBase?.revisions.map((revision) => revision.value),
      '分かれ目は本流と線の 2 つを渡して尋ねる',
    ).toEqual(['main', 'topic']);
  });

  it('起こすのは読む命令だけである', async () => {
    const { git, requests } = fakeGit();
    await createObserveRepository({ git }).execute(CWD);
    expect(requests.length, '1 つも起こさずに通ると、この確かめは何も見ていない').toBeGreaterThan(
      0,
    );
    expect(
      [...new Set(requests.map(shapeOf))].sort(),
      'ここに載っていない命令を足すときは、それがプロジェクトを書き換えないことを先に確かめること',
    ).toEqual([
      'branch --format= --no-merged=',
      'diff --name-only',
      'for-each-ref refs/heads --sort= --format=',
      `log --first-parent -n ${MAINLINE_LIMIT} --format=`,
      'merge-base',
      'rev-list --count',
      'worktree list --porcelain',
    ]);
  });

  it('--no-merged の相手だけは繋げて渡す', async () => {
    const { git, requests } = fakeGit();
    await createObserveRepository({ git }).execute(CWD);
    const unmerged = requests.find((request) => request.args[0] === 'branch');
    expect(unmerged?.args.at(-1), '離して渡すと、指定の打ち切りのほうを相手として食われる').toBe(
      '--no-merged=main',
    );
    expect(unmerged?.revisions, '相手を語に繋げたので、渡す revision は無い').toEqual([]);
  });
});

describe('起こせなかったとき', () => {
  it('`git` がインストールされていなければ、観測できなかったと言う', async () => {
    const observation = observationOf(
      await observeOverview({
        'worktree list --porcelain': unobservable(new GitFailure(GIT_NOT_INSTALLED)),
        [`for-each-ref refs/heads --sort=-committerdate --format=${BRANCH_REF_FORMAT}`]:
          unobservable(new GitFailure(GIT_NOT_INSTALLED)),
      }),
    );
    expect(
      observation.kind,
      '`git` が無いだけで「リポジトリではない」と答えると、すべてのプロジェクトが消える',
    ).toBe('unobservable');
  });

  it('`worktree` もブランチも無ければ、そこはリポジトリではない', async () => {
    const { git } = fakeGit({
      'worktree list --porcelain': unobservable(new GitFailure(GIT_EXIT_NONZERO)),
      [`for-each-ref refs/heads --sort=-committerdate --format=${BRANCH_REF_FORMAT}`]: unobservable(
        new GitFailure(GIT_EXIT_NONZERO),
      ),
    });
    expect(
      observationOf(await createObserveRepository({ git }).execute(CWD)),
      '観測できたうえで無かったのだから、誤りではなく「無い」である',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('ブランチが 1 本も無くても、`worktree` が在ればリポジトリである', async () => {
    const overview = observedOverview(
      await observeOverview({
        [`for-each-ref refs/heads --sort=-committerdate --format=${BRANCH_REF_FORMAT}`]:
          observed(''),
      }),
    );
    expect(
      overview.base,
      'まだ何も記録していないプロジェクトにはブランチが無い。片方が空なだけで「リポジトリではない」と言うと、作りたてのプロジェクトが消える',
    ).toBe('main');
    expect(overview.branches, 'ブランチはまだ 1 本も無い').toEqual([]);
  });

  it('分かれ目が引けない線も落とさない', async () => {
    const overview = observedOverview(
      await observeOverview({
        'merge-base main topic': unobservable(new GitFailure(GIT_EXIT_NONZERO)),
        'rev-list --count main..topic': unobservable(new GitFailure(GIT_EXIT_NONZERO)),
      }),
    );
    const [tip] = overview.tips;
    expect(tip?.name, '繋がりの無い線は普通に在る。1 本の失敗で木ごと落とすほうが嘘である').toBe(
      'topic',
    );
    expect(tip?.mergeBase, '引けなかった分かれ目は空のまま').toBe('');
    expect(tip?.ahead, '数えられなければ 0 として並べる').toBe(0);
  });

  it('数え上げの途中で `git` が居なくなれば、観測できなかったと言う', async () => {
    const observation = observationOf(
      await observeOverview({
        'merge-base main topic': unobservable(new GitFailure(GIT_NOT_INSTALLED)),
      }),
    );
    expect(
      observation.kind,
      '同じ失敗で残りも落ちる以上、揃わない木を見せるより黙るほうが正しい',
    ).toBe('unobservable');
  });
});

describe('ぶつかりの見込みを覚える', () => {
  it('先端が動いていなければ、差分を起こし直さない', async () => {
    const conflicts = createConflictCache();
    const first = fakeGit();
    await createObserveRepository({ git: first.git, conflicts }).execute(CWD);
    const second = fakeGit();
    const overview = observedOverview(
      await createObserveRepository({ git: second.git, conflicts }).execute(CWD),
    );

    expect(
      second.requests.filter((request) => request.args[0] === 'diff').length,
      '線の数だけ起こす見込みを毎回立て直すと、画面が尋ねるたびにプロジェクトが重くなる',
    ).toBe(0);
    expect(overview.conflicts, '覚えていた結果をそのまま返す').toEqual([
      { a: 'topic', b: 'hive-topic', count: 1, files: ['src/b.ts'] },
    ]);
  });

  it('先端が動けば立て直す', async () => {
    const conflicts = createConflictCache();
    await createObserveRepository({ git: fakeGit().git, conflicts }).execute(CWD);
    const moved = fakeGit({
      [`for-each-ref refs/heads --sort=-committerdate --format=${BRANCH_REF_FORMAT}`]: observed(
        [
          ['main', 'abc1234', '2026-08-04T10:00:00+09:00', '土台を置く', '*'].join(NUL),
          ['topic', '99999999', '2026-08-05T10:00:00+09:00', 'git を移す', ''].join(NUL),
          '',
        ].join('\n'),
      ),
    });
    await createObserveRepository({ git: moved.git, conflicts }).execute(CWD);
    expect(
      moved.requests.filter((request) => request.args[0] === 'diff').length,
      '先端が動けば触ったファイルも変わる。覚えた結果を返すと、無いぶつかりを見せる',
    ).toBe(2);
  });

  it('本流が進めば、先端が動いていなくても立て直す', async () => {
    const conflicts = createConflictCache();
    await createObserveRepository({ git: fakeGit().git, conflicts }).execute(CWD);
    // 名は main のまま、指している先だけが進んだ
    const advanced = fakeGit({
      [`for-each-ref refs/heads --sort=-committerdate --format=${BRANCH_REF_FORMAT}`]: observed(
        [
          ['main', 'abc9999', '2026-08-05T10:00:00+09:00', '本流が進む', '*'].join(NUL),
          ['topic', 'def5678', '2026-08-03T10:00:00+09:00', 'git を移す', ''].join(NUL),
          '',
        ].join('\n'),
      ),
    });
    await createObserveRepository({ git: advanced.git, conflicts }).execute(CWD);
    expect(
      advanced.requests.filter((request) => request.args[0] === 'diff').length,
      '見込みは分かれ目からの差分である。本流が線の記録を取り込めば、先端が動かなくても重なりは消える',
    ).toBe(2);
  });
});
