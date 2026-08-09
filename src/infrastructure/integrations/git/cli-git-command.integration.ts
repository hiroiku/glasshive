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

/* 記録を読む道具を、読み取りだけで起こす。何にも書き込まない。

   **指しは必ず `--end-of-options` の後ろに置く。** 形の確かめは値の側で済んでいるが、
   確かめを通った字がいつまでも安全である保証は無い。ここで指定の切れ目を置いておけば、
   後ろに何が並んでも外の道具の指定にはならない。

   `GIT_OPTIONAL_LOCKS=0` を渡すのは、`diff` や `branch` が索引を書き直すことがあるからで
   ある。観るだけの道具が観られる側を書き換えては、観測そのものが嘘になる。

   落ちた理由はここで分ける。ここが errno の見える唯一の場所で、一度潰すと上の層では
   二度と分けられない。 */

const execFileAsync = promisify(execFile);

/** 答えを待つ上限。待ち続けると、画面がひと目ぶんの観測ごと止まる */
const DEFAULT_TIMEOUT_MS = 10_000;

/** 受け皿の大きさ。触ったファイルの一覧は、大きな枝だと数 MiB になる */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface GitRunOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
}

/** 起こし方。**落ちたら投げる。** 空文字に均すと、上で理由を分けられなくなる */
export type GitRunner = (args: readonly string[], options: GitRunOptions) => Promise<string>;

export interface CliGitCommandOptions {
  /** 検査で差し替える。既定は node:child_process の execFile を包んだもの */
  readonly run?: GitRunner;
  readonly timeoutMs?: number;
}

/* git は巣の場所を cwd からだけでなく環境からも受け取る。起こした側が `GIT_DIR` を
   持っていると(git の掛かりや `rebase --exec` の下ではそうなる)、尋ねられた場所とは
   別の巣の答えが返る。**どの巣を観るかは cwd だけが決める。** */
const REPOSITORY_SELECTING_VARS = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

/** 子に渡す環境。索引の書き直しを止め、巣を選ぶ変数を落とす */
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

/* execFile は落ち方で誤りの形を変える。起こせなかったときは `code` が errno の字、
   非ゼロで終わったときは `code` が終わりの番号(数)になる。 */
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

   **`ENOENT` と `ENOTDIR` は二つの意味を持つ。** 道具が手元に無いときと、起こす場所が
   場所でないとき(消えた・ファイルだった)で同じ errno が返る。前者はすべてのリポジトリが
   観られない話(503)、後者はその巣がもう無いだけの話(200 と「無い」)なので、場所を
   確かめて分ける。 */
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
        // 言い分を捨てない。なぜ非ゼロだったのかは、ここにしか残らない
        details: {
          ...details,
          status,
          stderr: textOf(propOf(error, 'stderr')),
        },
      }),
    );
  }

  /* 説明の付かない落ち方。ここに来るものは、たいてい直すべき穴である。

     **言い分は自分で書く。** 投げられた誤りの字には errno も stderr も混ざっていて、
     それは外へ出す包みの `message` にそのまま載る。ここが errno の見える最後の場所で、
     渡してしまえば外の道へ漏れる。証跡は `details` に置いて内側に留める。 */
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
      /* 巣の場所が絶対の道でなければ起こさない。相対の名や空の字を渡すと、git は
         この道具自身の居場所で動き、尋ねられていない巣の答えを持って帰ってくる。 */
      if (!path.isAbsolute(request.cwd)) return absent('no-source');

      const revisions = request.revisions.map((revision) => revision.value);
      /* 指しの手前で指定を打ち切る。ここから後ろの字は、`-` で始まっていても
         外の道具の指定にはならない。 */
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
