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

/* 本物の git は起こさない。**起こすと、確かめているのがローカルの機械の設定になる。**
   起こし方を差し替えて、渡す引数と、落ち方の分け方だけを見る。

   `ref` はポートが宣言した形のまま渡す。文字列の形を確かめるのは `ref` を作る側の仕事で、
   その確かめは domain の側で見ている。ここで見るのは、受け取った文字列をどこへ置くかだけ。

   ディレクトリを作るのは `mkdtemp` の下だけで、確かめが終わったら消す。 */

let existingDir = '';

beforeAll(() => {
  existingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-git-'));
});

afterAll(() => {
  fs.rmSync(existingDir, { recursive: true, force: true });
});

/** 渡された引数を覚えておく起こし方 */
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

describe('渡す引数', () => {
  it('`ref` の手前でオプションを打ち切る', async () => {
    const { run, calls } = recorder('');
    const git = createCliGitCommandIntegration({ run });
    await git.run({
      cwd: existingDir,
      args: ['rev-list', '--count'],
      revisions: [{ value: 'main..x' }],
    });
    expect(
      calls[0],
      '打ち切りが無いと、`ref` の文字列がそのまま git のオプションとして読まれる',
    ).toEqual(['rev-list', '--count', '--end-of-options', 'main..x']);
  });

  it('`ref` が無いときは打ち切りも置かない', async () => {
    const { run, calls } = recorder('');
    const git = createCliGitCommandIntegration({ run });
    await git.run({
      cwd: existingDir,
      args: ['worktree', 'list', '--porcelain'],
      revisions: [],
    });
    expect(calls[0], '要らない引数を足すと、古い git が受け取れなくなる').toEqual([
      'worktree',
      'list',
      '--porcelain',
    ]);
  });

  it('出力のテキストはそのまま返す', async () => {
    const git = createCliGitCommandIntegration({
      run: recorder('worktree /work/hive\n').run,
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output, 'パースは domain の仕事で、ここはテキストを運ぶだけである').toEqual({
      kind: 'observed',
      value: 'worktree /work/hive\n',
    });
  });
});

describe('起こす作業ディレクトリ', () => {
  it('尋ねられた作業ディレクトリで、待つ上限を決めて起こす', async () => {
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
      'どのプロジェクトを観るかは cwd だけが決める。渡し損ねると、尋ねられていないプロジェクトの出力を持って帰る',
    ).toBe(existingDir);
    expect(
      seen[0]?.timeoutMs,
      '上限を渡さないと、答えないプロジェクト 1 つで画面がひと目ぶん止まったままになる',
    ).toBe(10_000);
  });

  for (const [what, cwd] of [
    ['相対パス', 'work/hive'],
    ['空の文字列', ''],
    ['上へ辿るパス', '../hive'],
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
        '絶対パスでなければ、git は glasshive 自身の作業ディレクトリで動く。尋ねられていないプロジェクトの出力が返る',
      ).toBe(0);
      expect(output, '見に行かないと決めたのだから、そこには何も無い').toEqual({
        kind: 'absent',
        reason: 'no-source',
      });
    });
  }
});

describe('子プロセスに渡す環境', () => {
  it('プロジェクトを選ぶ変数を落とす', () => {
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
      'これを引き継ぐと、どのプロジェクトを尋ねても同じプロジェクトの出力が返る。観測がまるごと嘘になる',
    ).toEqual(['GIT_OPTIONAL_LOCKS']);
    expect(env.GIT_OPTIONAL_LOCKS, '観るだけなのでインデックスの書き直しを止める').toBe('0');
    expect(env.PATH, 'git を見つける PATH まで落としては、何も起こせない').toBe('/usr/bin');
  });

  it('`git` の文言を英語のままにする', () => {
    const env = childEnv({ PATH: '/usr/bin', LANG: 'ja_JP.UTF-8', LANGUAGE: 'ja' });
    expect(
      env.LC_ALL,
      '断ったのか、そこがリポジトリでないのかは `stderr` の文言でしか分けられない。訳されていると読めない',
    ).toBe('C');
    expect(env.LANGUAGE, '`LANGUAGE` が残っていると、locale が C でも訳された文言が返る').toBe(
      undefined,
    );
  });

  it('元の環境は書き換えない', () => {
    const source = { PATH: '/usr/bin', GIT_DIR: '/other/.git' };
    childEnv(source);
    expect(source.GIT_DIR, '渡された環境を削ると、glasshive 自身の `process.env` が壊れる').toBe(
      '/other/.git',
    );
  });
});

describe('落ち方を分ける', () => {
  it('`git` がインストールされていないのは観測できなかったこと', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 'ENOENT' }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(
      output.kind,
      'git が無いだけでプロジェクトが消えたことにすると、ユーザーは嘘を読む',
    ).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, 'エラーコードで 503 と決まる').toBe('git.not_installed');
  });

  it('起こす作業ディレクトリが無いのは、そこに何も無いということ', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 'ENOENT' }),
    });
    const output = await git.run({
      cwd: path.join(existingDir, 'not-here'),
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(
      output,
      '同じ errno でも、git が無いのと作業ディレクトリが無いのでは外へ返す HTTP ステータスが変わる',
    ).toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it('起こす作業ディレクトリがファイルなのも、そこに何も無いということ', async () => {
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
    expect(
      output,
      'プロジェクトのパスがファイルなのは、こちらの不具合ではなくプロジェクトが無いということである',
    ).toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it('起こす権限が無い', async () => {
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

  it('非ゼロで終わったときは git の `stderr` を捨てない', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({ code: 128, stderr: "fatal: bad revision 'nope'\n" }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, '終了コードは errno ではない').toBe('git.exit_nonzero');
    expect(
      output.error.details,
      'なぜ非ゼロだったのかは、ここに残さないと後から誰も言えない',
    ).toEqual({
      command: 'git worktree list',
      status: 128,
      stderr: "fatal: bad revision 'nope'\n",
    });
  });

  /* `git` は「そこはリポジトリではない」も「このリポジトリは読まない」も 128 で終わる。
     分ける手がかりは `stderr` にしかない。 */
  it('そこがリポジトリでないと `git` が言ったのは、観測できたうえで無かったこと', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({
        code: 128,
        stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
      }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output, '観測はできて、そこに無かった。誤りではない').toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it('所有者が違うと断られたのは、リポジトリが無いことではない', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({
        code: 128,
        stderr: [
          "fatal: detected dubious ownership in repository at '/work/hive'",
          'To add an exception for this directory, call:',
          '',
          '\tgit config --global --add safe.directory /work/hive',
          '',
        ].join('\n'),
      }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['worktree', 'list'],
      revisions: [],
    });
    expect(output.kind, '断られたのを「無い」と読むと、画面は既に在るリポジトリを作らせる').toBe(
      'unobservable',
    );
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, 'エラーコードで 503 と決まる').toBe('git.denied');
    expect(
      output.error.message,
      'message は外へ返すレスポンスに載る。パスも errno も混ぜない',
    ).toBe('git refused to read this repository');
  });

  it('リポジトリの中を開けなかったのも、断られたこと', async () => {
    const git = createCliGitCommandIntegration({
      run: failing({
        code: 128,
        stderr: "fatal: cannot open '/work/hive/.git/HEAD': Permission denied\n",
      }),
    });
    const output = await git.run({
      cwd: existingDir,
      args: ['for-each-ref'],
      revisions: [],
    });
    expect(output.kind).toBe('unobservable');
    if (output.kind !== 'unobservable') return;
    expect(output.error.code, '読めなかったのであって、そこに無いのではない').toBe('git.denied');
  });

  it('説明の付かない落ち方は、こちらの不具合として返す', async () => {
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
      '想定していない落ち方を再試行の側へ倒すと、直らない呼び出しを永久に叩かせる',
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
      'message は外へ返すレスポンスに載る。生の errno を渡すと、そのまま外部 API へ漏れる',
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

  it('`maxBuffer` を超える出力でも、機械の事情は外へ出さない', async () => {
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
    expect(output.kind, '切れた出力をパースすると、触っていないものを触ったことにする').toBe(
      'unobservable',
    );
    if (output.kind !== 'unobservable') return;
    expect(output.error.message, '`maxBuffer` はこちらの決めごとで、外に言うことではない').toBe(
      'git failed in a way we cannot explain',
    );
  });
});
