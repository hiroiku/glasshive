import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  GIT_DENIED,
  GIT_EXIT_NONZERO,
  GIT_NOT_INSTALLED,
  GIT_TIMEOUT,
  type GitCommandIntegration,
  type GitCommandRequest,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import { GitCommandError } from '~/infrastructure/errors/git/git-command.error.ts';

/* `git` を、読み取りだけで起動する。何にも書き込まない。

   **リビジョンは必ず `--end-of-options` の後ろに置く。** 形式の検証は値オブジェクトの側で
   済んでいるが、検証を通った文字列がいつまでも安全である保証は無い。ここでオプションの
   切れ目を置いておけば、後ろに何が並んでも `git` のオプションにはならない。

   `GIT_OPTIONAL_LOCKS=0` を渡すのは、`diff` や `branch` がインデックスを書き直すことが
   あるからである。観るだけの glasshive が観測元を書き換えては、観測そのものが嘘になる。

   落ちた理由はここで分ける。ここが errno の見える唯一の場所で、一度潰すと上の層では
   二度と分けられない。 */

const execFileAsync = promisify(execFile);

/** 出力を待つ上限。待ち続けると、木の観測ごと画面が止まる */
const DEFAULT_TIMEOUT_MS = 10_000;

/** バッファの大きさ。触ったファイルの一覧は、大きなブランチだと数 MiB になる */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface GitRunOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
}

/** 起動の仕方。**落ちたら投げる。** 空文字に潰すと、上で理由を分けられなくなる */
export type GitRunner = (args: readonly string[], options: GitRunOptions) => Promise<string>;

export interface CliGitCommandOptions {
  /** テストで差し替える。既定は node:child_process の execFile を包んだもの */
  readonly run?: GitRunner;
  readonly timeoutMs?: number;
}

/* git はリポジトリのパスを cwd からだけでなく環境変数からも受け取る。起動した側が
   `GIT_DIR` を持っていると(git のフックや `rebase --exec` の下ではそうなる)、尋ねられた
   パスとは別のリポジトリの出力が返る。**どのリポジトリを観るかは cwd だけが決める。** */
const REPOSITORY_SELECTING_VARS = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

/** 子プロセスに渡す環境変数。インデックスの書き直しを止め、リポジトリを選ぶ変数を落とす */
export function childEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source, GIT_OPTIONAL_LOCKS: '0' };
  for (const name of REPOSITORY_SELECTING_VARS) delete env[name];
  return env;
}

const runGit: GitRunner = async (args, { cwd, timeoutMs }) => {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: childEnv(process.env),
  });
  return stdout;
};

const propOf = (error: unknown, key: string): unknown =>
  typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;

/* execFile は落ち方でエラーの形を変える。起動できなかったときは `code` が errno の文字列、
   非ゼロで終わったときは `code` が終了コード(数値)になる。 */
const errnoOf = (error: unknown): string | undefined => {
  const code = propOf(error, 'code');
  return typeof code === 'string' ? code : undefined;
};

const exitCodeOf = (error: unknown): number | undefined => {
  const code = propOf(error, 'code');
  return typeof code === 'number' ? code : undefined;
};

const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('utf8') : '';

const isDirectory = (candidate: string): boolean =>
  fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory() ?? false;

/* 落ちた理由を分ける。

   **`ENOENT` と `ENOTDIR` は二つの意味を持つ。** `git` がインストールされていないときと、
   起動する cwd がディレクトリでないとき(消えた・ファイルだった)で同じ errno が返る。
   前者はすべてのリポジトリが観られない話(503)、後者はそのリポジトリがもう無いだけの話
   (200 と「無い」)なので、cwd を確かめて分ける。 */
function classifyFailure(error: unknown, request: GitCommandRequest): Observation<never> {
  const details = { command: ['git', ...request.args].join(' ') };
  const errno = errnoOf(error);

  if (errno === 'ENOENT' || errno === 'ENOTDIR') {
    if (!isDirectory(request.cwd)) return absent('no-source');
    return unobservable(
      new GitCommandError('git is not installed', GIT_NOT_INSTALLED, {
        cause: error,
        details,
      }),
    );
  }
  if (errno === 'EACCES' || errno === 'EPERM') {
    return unobservable(
      new GitCommandError('Not permitted to run git', GIT_DENIED, {
        cause: error,
        details,
      }),
    );
  }
  if (errno === 'ETIMEDOUT' || propOf(error, 'killed') === true) {
    return unobservable(
      new GitCommandError('git did not answer in time', GIT_TIMEOUT, {
        cause: error,
        details,
      }),
    );
  }

  const status = exitCodeOf(error);
  if (status !== undefined) {
    return unobservable(
      new GitCommandError('git exited non-zero', GIT_EXIT_NONZERO, {
        cause: error,
        // `stderr` を捨てない。なぜ非ゼロだったのかは、ここにしか残らない
        details: {
          ...details,
          status,
          stderr: textOf(propOf(error, 'stderr')),
        },
      }),
    );
  }

  /* 説明の付かない落ち方。ここに来るものは、たいてい直すべき穴である。

     **メッセージは自分で書く。** 投げられたエラーの `message` には errno も stderr も
     混ざっていて、それは外へ出すレスポンスの `message` にそのまま載る。ここが errno の
     見える最後の場所で、渡してしまえば外部 API へ漏れる。証跡は `details` に置いて
     内側に留める。 */
  return unobservable(
    new UnexpectedError('git failed in a way we cannot explain', {
      cause: error,
      details: {
        ...details,
        errno,
        signal: propOf(error, 'signal'),
        stderr: textOf(propOf(error, 'stderr')),
      },
    }),
  );
}

export function createCliGitCommandIntegration(
  options?: CliGitCommandOptions,
): GitCommandIntegration {
  const run = options?.run ?? runGit;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async run(request) {
      /* リポジトリのパスが絶対パスでなければ起動しない。相対パスや空文字列を渡すと、git は
         glasshive 自身の cwd で動き、尋ねられていないリポジトリの出力を持って帰ってくる。 */
      if (!path.isAbsolute(request.cwd)) return absent('no-source');

      const revisions = request.revisions.map((revision) => revision.value);
      /* リビジョンの手前でオプションを打ち切る。ここから後ろの文字列は、`-` で始まって
         いても `git` のオプションにはならない。 */
      const args =
        revisions.length === 0
          ? [...request.args]
          : [...request.args, '--end-of-options', ...revisions];
      try {
        return observed(await run(args, { cwd: request.cwd, timeoutMs }));
      } catch (error) {
        return classifyFailure(error, request);
      }
    },
  };
}
