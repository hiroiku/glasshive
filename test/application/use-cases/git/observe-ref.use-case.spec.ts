import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  GIT_EXIT_NONZERO,
  GIT_NOT_INSTALLED,
  type GitCommandIntegration,
  type GitCommandRequest,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import {
  createObserveRef,
  type ObserveRefUseCase,
  type RefDetail,
} from '~/application/use-cases/git/observe-ref.use-case.ts';

/* 尋ねるときに渡す書式と上限。**答えの字を引く鍵になるので、内側の宣言と対で直すこと。**
   食い違うと、この確かめは何も引けないまま「そんな指しは無い」とだけ言う。 */
const COMMIT_LOG_FORMAT = '%h%x00%cI%x00%an%x00%s';
const UNIQUE_LOG_LIMIT = 40;
const RECENT_LOG_LIMIT = 15;

class GitFailure extends AppError {
  readonly code: string;

  constructor(code: string) {
    super('検査で起こした失敗');
    this.code = code;
  }
}

const NUL = '\0';
const CWD = '/work/hive';

const commitLine = (sha: string, subject: string): string =>
  [sha, '2026-08-04T10:00:00+09:00', 'hiroiku', subject].join(NUL);

const UNIQUE_LOG = `log -n ${UNIQUE_LOG_LIMIT} --format=${COMMIT_LOG_FORMAT} main..topic`;
const RECENT_LOG = `log -n ${RECENT_LOG_LIMIT} --format=${COMMIT_LOG_FORMAT} topic`;

const ANSWERS: Record<string, string> = {
  'rev-parse --abbrev-ref HEAD': 'main\n',
  [UNIQUE_LOG]: `${commitLine('abc1234', 'git を移す')}\n`,
  [RECENT_LOG]: `${commitLine('abc1234', 'git を移す')}\n${commitLine('9990000', '土台')}\n`,
  'rev-list --count topic..main': '2\n',
  'diff --numstat main...topic': '12\t3\tsrc/a.ts\n1\t0\tsrc/b.ts\n',
};

const keyOf = (request: GitCommandRequest): string =>
  [...request.args, ...request.revisions.map((revision) => revision.value)].join(' ');

/* **見えたことを先に言う。** 尋ね方が変わって答えの字が引けなくなると、この道具は
   「そんな指しは無い」に倒れる。そこで早々に切り上げる書き方をすると、確かめは
   何も見ないまま通ってしまう。 */
function observedDetail(result: Awaited<ReturnType<ObserveRefUseCase['execute']>>): RefDetail {
  expect(result.ok, '断る求めではない').toBe(true);
  if (!result.ok) throw new Error('断られた');
  expect(result.value.kind, '見えるはずのものが見えないなら、その先の確かめに意味は無い').toBe(
    'observed',
  );
  if (result.value.kind !== 'observed') throw new Error('観測できていない');
  return result.value.value;
}

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

const observeRef = async (
  request: { rev: string; base: string | null },
  overrides?: Record<string, Observation<string>>,
) =>
  createObserveRef({ git: fakeGit(overrides).git }).execute({
    projectPath: CWD,
    rev: request.rev,
    base: request.base,
  });

/* 起こした命令の形。繋げて渡した相手は落とす — 相手が何であれ、命令の種類は変わらない */
const shapeOf = (request: GitCommandRequest): string =>
  request.args.map((arg) => arg.replace(/=.*$/s, '=')).join(' ');

describe('尋ね方', () => {
  it('起こすのは読む命令だけである', async () => {
    // 相手を自分で決め、入っていない記録が無い道まで通す。起こす命令はこれで出そろう
    const { git, requests } = fakeGit({ [UNIQUE_LOG]: observed('') });
    await createObserveRef({ git }).execute({
      projectPath: CWD,
      rev: 'topic',
      base: null,
    });
    expect(requests.length, '1 つも起こさずに通ると、この確かめは何も見ていない').toBeGreaterThan(
      0,
    );
    expect(
      [...new Set(requests.map(shapeOf))].sort(),
      'ここに載っていない命令を足すときは、それが巣を書き換えないことを先に確かめること',
    ).toEqual([
      'diff --numstat',
      `log -n ${RECENT_LOG_LIMIT} --format=`,
      `log -n ${UNIQUE_LOG_LIMIT} --format=`,
      'rev-list --count',
      'rev-parse --abbrev-ref HEAD',
    ]);
  });
});

describe('求めを断る', () => {
  it('形の違う指しは git まで届けない', async () => {
    const { git, requests } = fakeGit();
    const result = await createObserveRef({ git }).execute({
      projectPath: CWD,
      rev: '--upload-pack=/tmp/evil',
      base: null,
    });
    expect(result.ok, '確かめを抜けた字は、外の道具の差し替えとして読まれる').toBe(false);
    if (result.ok) return;
    expect(result.error.code, '名札で 400 と決まる').toBe('git.invalid_revision');
    expect(requests.length, '断る求めで外の道具を起こしてはならない').toBe(0);
  });

  it('比べる相手の形も確かめる', async () => {
    const result = await observeRef({ rev: 'topic', base: '--upload-pack=x' });
    expect(result.ok, '相手の側だけ確かめ忘れると、同じ穴が残る').toBe(false);
  });
});

describe('比べる相手を決める', () => {
  it('言われなければ、いま出ている枝を相手にする', async () => {
    const detail = observedDetail(await observeRef({ rev: 'topic', base: null }));
    expect(detail.base, '相手が無いと、何と比べた一覧なのか言えない').toBe('main');
  });

  it('相手が自分と同じなら、相手は無いものとする', async () => {
    const detail = observedDetail(await observeRef({ rev: 'topic', base: 'topic' }));
    expect(detail.base, '自分と自分を比べても隔たりは出ない').toBe(null);
    expect(detail.unique, '比べる相手が無いのだから、直近の記録である').toBe(false);
  });

  it('空の字で言われたのは、言われなかったのと同じ', async () => {
    const detail = observedDetail(await observeRef({ rev: 'topic', base: '' }));
    expect(
      detail.base,
      '空の字を「言われた相手」として形を確かめると、普通の求めが断りに化ける',
    ).toBe('main');
  });

  it('いま出ている枝が引けなければ、相手を決めない', async () => {
    const detail = observedDetail(
      await observeRef(
        { rev: 'topic', base: null },
        {
          'rev-parse --abbrev-ref HEAD': unobservable(new GitFailure(GIT_EXIT_NONZERO)),
        },
      ),
    );
    expect(detail.base, '当てずっぽうの相手と比べるより、比べないほうがよい').toBe(null);
  });
});

describe('並べる記録', () => {
  it('本流に入っていない記録を先に並べる', async () => {
    const detail = observedDetail(await observeRef({ rev: 'topic', base: 'main' }));
    expect(detail.unique, 'これが false だと、同じ一覧の意味がまるで変わる').toBe(true);
    expect(detail.commits.map((commit) => commit.sha)).toEqual(['abc1234']);
  });

  it('入っていない記録が無ければ、直近の記録に落とす', async () => {
    const detail = observedDetail(
      await observeRef({ rev: 'topic', base: 'main' }, { [UNIQUE_LOG]: observed('') }),
    );
    expect(detail.unique, '落としたことは、必ず値として残す').toBe(false);
    expect(detail.commits.length, '空の一覧を見せるより、直近を見せるほうが役に立つ').toBe(2);
  });

  it('記録が 1 つも無ければ、無いと言う', async () => {
    const result = await observeRef(
      { rev: 'topic', base: 'main' },
      { [UNIQUE_LOG]: observed(''), [RECENT_LOG]: observed('') },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value,
      'そんな指しは無い、は見に行けたうえでの答えである。404 にすると求めた側の落ち度になる',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });
});

describe('差分の姿', () => {
  it('分かれ目から先の差分と、本流への遅れを添える', async () => {
    const detail = observedDetail(await observeRef({ rev: 'topic', base: 'main' }));
    expect(detail.stat, '数え上げは差分ぜんぶの話である').toEqual({
      files: 2,
      add: 13,
      del: 3,
    });
    expect(detail.behind, '遅れは本流の側から数える').toBe(2);
    expect(
      detail.files.map((file) => file.path),
      '動きの大きい順に並べる',
    ).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('比べる相手が無ければ、差分も遅れも出さない', async () => {
    const detail = observedDetail(await observeRef({ rev: 'topic', base: 'topic' }));
    expect(detail.stat, '相手の無い差分は取りようがない').toBe(null);
    expect(detail.behind, '同じく、遅れも数えようがない').toBe(0);
  });
});

describe('起こせなかったとき', () => {
  it('道具が手元に無ければ、観られなかったと言う', async () => {
    const result = await observeRef(
      { rev: 'topic', base: 'main' },
      { [UNIQUE_LOG]: unobservable(new GitFailure(GIT_NOT_INSTALLED)) },
    );
    expect(result.ok, '断る求めではない。求めの形は正しかった').toBe(true);
    if (!result.ok) return;
    expect(result.value.kind, '道具が無いことを「記録が無い」と言うと、観る人は嘘を読む').toBe(
      'unobservable',
    );
  });

  it('相手を尋ねる途中で道具が居なくなっても、観られなかったと言う', async () => {
    const result = await observeRef(
      { rev: 'topic', base: null },
      {
        'rev-parse --abbrev-ref HEAD': unobservable(new GitFailure(GIT_NOT_INSTALLED)),
      },
    );
    expect(result.ok, '断る求めではない。求めの形は正しかった').toBe(true);
    if (!result.ok) throw new Error('断られた');
    expect(
      result.value.kind,
      '相手が決まらなかったのと、相手を尋ねられなかったのは別である。後者を前者に潰すと、道具の無い機械でどの指しも「比べる相手が無い」と出る',
    ).toBe('unobservable');
  });
});
