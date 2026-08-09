import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  childEnv,
  createCliGitCommandIntegration,
  type GitRunner,
  type GitRunOptions,
} from '~/infrastructure/integrations/git/cli-git-command.integration.ts';

/* 本物の git は起こさない。**起こすと、確かめているのが手元の機械の設え になる。**
   起こし方を差し替えて、渡す語と、落ち方の読み分けだけを見る。

   指しは口が宣言した形のまま渡す。字の形を確かめるのは指しを作る側の仕事で、
   その確かめは domain の側で見ている。ここで見るのは、受け取った字をどこへ置くかだけ。

   場所を作るのは mkdtemp の下だけで、確かめが終わったら畳む。 */

let existingDir = '';

beforeAll(() => {
  existingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-git-'));
});

afterAll(() => {
  fs.rmSync(existingDir, { recursive: true, force: true });
});

/** 起こした語を覚えておく起こし方 */
function recorder(answer: string): { run: GitRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push([...args]);
      return answer;
    },
  };
}

const failing = (error: unknown): GitRunner => {
  return async () => {
    throw error;
  };
};

describe('渡す語', () => {
  it('指しの手前で指定を打ち切る', async () => {
    const { run, calls } = recorder('');
    const git = createCliGitCommandIntegration({ run });
    await git.run({
      cwd: existingDir,
      args: ['rev-list', '--count'],
      revisions: [{ value: 'main..x' }],
    });
    expect(calls[0], '打ち切りが無いと、指しの字がそのまま外の道具の指定として読まれる').toEqual([
      'rev-list',
      '--count',
      '--end-of-options',
      'main..x',
    ]);
  });

  it('指しが無いときは打ち切りも置かない', async () => {
    const { run, calls } = recorder('');
    const git = createCliGitCommandIntegration({ run });
    await git.run({
      cwd: existingDir,
      args: ['worktree', 'list', '--porcelain'],
      revisions: [],
    });
    expect(calls[0], '要らない語を足すと、古い git が受け取れなくなる').toEqual([
      'worktree',
      'list',
      '--porcelain',
    ]);
  });

  it('答えの字はそのまま返す', async () => {
    const git = createCliGitCommandIntegration({
      run: recorder('worktree /work/hive\n').run,
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output, '読み解きは domain の仕事で、ここは字を運ぶだけである').toEqual({
      kind: 'observed',
      value: 'worktree /work/hive\n',
    });
  });
});

describe('起こす場所', () => {
  it('尋ねられた場所で、待つ上限を決めて起こす', async () => {
    const seen: GitRunOptions[] = [];
    const git = createCliGitCommandIntegration({
      run: async (_args, options) => {
        seen.push(options);
        return '';
      },
    });
    await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(
      seen[0]?.cwd,
      'どの巣を観るかは cwd だけが決める。渡し損ねると、尋ねられていない巣の答えを持って帰る',
    ).toBe(existingDir);
    expect(
      seen[0]?.timeoutMs,
      '上限を渡さないと、答えない巣ひとつで画面がひと目ぶん止まったままになる',
    ).toBe(10_000);
  });

  for (const [what, cwd] of [
    ['相対の名', 'work/hive'],
    ['空の字', ''],
    ['上へ辿る道', '../hive'],
  ] as const) {
    it(`${what}では起こさない`, async () => {
      const { run, calls } = recorder('');
      const git = createCliGitCommandIntegration({ run });
      const output = await git.run({
        cwd,
        args: ['worktree', 'list'],
        revisions: [],
      });
      expect(
        calls.length,
        '絶対の道でなければ、git はこの道具自身の居場所で動く。尋ねられていない巣の答えが返る',
      ).toBe(0);
      expect(output, '見に行かないと決めたのだから、そこには何も無い').toEqual({
        kind: 'absent',
        reason: 'no-source',
      });
    });
  }
});

describe('子に渡す環境', () => {
  it('巣を選ぶ変数を落とす', () => {
    const env = childEnv({
      PATH: '/usr/bin',
      GIT_DIR: '/other/.git',
      GIT_WORK_TREE: '/other',
      GIT_INDEX_FILE: '/other/.git/index',
      GIT_COMMON_DIR: '/other/.git',
      GIT_OBJECT_DIRECTORY: '/other/.git/objects',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/elsewhere',
      GIT_NAMESPACE: 'ns',
    });
    expect(
      Object.keys(env).filter((name) => name.startsWith('GIT_')),
      'これを引き継ぐと、どの巣を尋ねても同じ巣の答えが返る。観測がまるごと嘘になる',
    ).toEqual(['GIT_OPTIONAL_LOCKS']);
    expect(env.GIT_OPTIONAL_LOCKS, '観るだけなので索引の書き直しを止める').toBe('0');
    expect(env.PATH, '道具を見つける道まで落としては、何も起こせない').toBe('/usr/bin');
  });

  it('元の環境は書き換えない', () => {
    const source = { PATH: '/usr/bin', GIT_DIR: '/other/.git' };
    childEnv(source);
    expect(source.GIT_DIR, '渡された環境を削ると、この道具そのものの足元が崩れる').toBe(
      '/other/.git',
    );
  });
});

describe('落ち方を分ける', () => {
  it('道具が手元に無いのは見に行けなかったこと', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 'ENOENT' }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output.kind, '道具が無いだけで巣が消えたことにすると、観る人は嘘を読む').toBe(
      'unobservable',
    );
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, '名札で 503 と決まる').toBe('git.not_installed');
  });

  it('起こす場所が無いのは、そこに何も無いということ', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 'ENOENT' }),
    });
    const output = await git.run({
      cwd: path.join(existingDir, 'not-here'),
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output, '同じ errno でも、道具が無いのと場所が無いのでは外へ返す番号が変わる').toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it('起こす場所が場所でないのも、そこに何も無いということ', async () => {
    const notADirectory = path.join(existingDir, 'file');
    fs.writeFileSync(notADirectory, '');
    const git = createCliGitCommandIntegration({
      run: failing({ code: 'ENOTDIR' }),
    });
    const output = await git.run({
      cwd: notADirectory,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output, '巣の場所がファイルなのは、こちらの穴ではなく巣が無いということである').toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it('起こす権利が無い', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 'EACCES' }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['log'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, '断られたのであって、無かったのではない').toBe('git.denied');
  });

  it('時間内に答えなかった', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ killed: true, signal: 'SIGTERM' }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['log'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, 'もう一度求めれば通るかもしれない側の失敗である').toBe('git.timeout');
  });

  it('非ゼロで終わったときは言い分を捨てない', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 128, stderr: 'fatal: not a git repository\n' }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, '終わりの番号は errno ではない').toBe('git.exit_nonzero');
    expect(
      output.error.details,
      'なぜ非ゼロだったのかは、ここに残さないと後から誰も言えない',
    ).toEqual({
      command: 'git worktree list',
      status: 128,
      stderr: 'fatal: not a git repository\n',
    });
  });

  it('説明の付かない落ち方は、こちらの穴として返す', async () => {
    const git = createCliGitCommandIntegration({
      run: failing(new Error('壊れた')),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['log'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(
      output.error.code,
      '想定していない落ち方を再試行の側へ倒すと、直らない求めを永久に叩かせる',
    ).toBe('unexpected');
  });

  it('説明の付かない落ち方でも、機械の事情は外へ出さない', async () => {
    const git = createCliGitCommandIntegration({
      run: failing(
        Object.assign(new Error('spawn git EMFILE'), {
          code: 'EMFILE',
          stderr: 'fatal: /secret/path が読めない\n',
        }),
      ),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['log'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(
      output.error.message,
      '言い分は外へ出す包みに載る。生の errno を渡すと、そのまま外の道へ漏れる',
    ).toBe('git failed in a way we cannot explain');
    expect(
      output.error.details,
      '外へは出さないが、何が起きたのかは内側に残さないと後から誰も言えない',
    ).toMatchObject({
      command: 'git log',
      errno: 'EMFILE',
      stderr: 'fatal: /secret/path が読めない\n',
    });
  });

  it('受け皿より大きな答えも、機械の事情は外へ出さない', async () => {
    const git = createCliGitCommandIntegration({
      run: failing(
        Object.assign(new Error('stdout maxBuffer length exceeded'), {
          code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        }),
      ),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['diff'],
      revisions: [],
    });
    expect(output.kind, '切れた答えを読み解くと、触っていないものを触ったことにする').toBe(
      'unobservable',
    );
    if (output.kind !== 'unobservable') return;
    expect(output.error.message, '受け皿の大きさはこちらの決めごとで、外に言うことではない').toBe(
      'git failed in a way we cannot explain',
    );
  });
});
