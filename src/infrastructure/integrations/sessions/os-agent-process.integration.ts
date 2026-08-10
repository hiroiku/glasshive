import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type {
  AgentProcessIntegration,
  LiveProcess,
} from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import { ProcessInspectionError } from '~/infrastructure/errors/sessions/transcript-read.error.ts';

/* OS に生きているプロセスを数えさせる。

   `ps` で `claude` という名の pid を集め、その pid ごとに作業ディレクトリを引く。引き方は
   機械で違う — Linux は `/proc/<pid>/cwd` の readlink、それ以外は `lsof -d cwd`。

   **数えられなかったことを 0 件に潰さない。** 0 件と答えると待機中の枠がなくなり、待って
   いるセッションが残らず「終了」として並ぶ。しかもユーザーからは、そのプロジェクトが
   静まり返っているようにしか見えない。だから 0 件と言うのは `ps` が答えたうえで `claude` が
   1 つも居なかったときだけで、pid は在ったのに作業ディレクトリを 1 つも引けなかったときは
   観測できなかったとして返す。

   逆に、引けた分を捨てもしない。一部だけ引けなかったのは、その 1 つを落として先へ進む。

   引いた作業ディレクトリはそのまま渡す。`lsof -d cwd` も `/proc/<pid>/cwd` も元から解決済みの
   パスを返すので、`realpath` を掛け直す必要が無い。 */

export interface OsAgentProcessOptions {
  /** テストで差し替える。既定は node:child_process の execFileSync を包んだもの */
  readonly run?: (file: string, args: readonly string[]) => string;
  readonly platform?: NodeJS.Platform;
}

/* 既定の起動の仕方。**落ちたら投げる。**
   ここで空文字に潰すと、出力が空だったのか起動できなかったのかを上で分けられなくなる。 */
function runCommand(file: string, args: readonly string[]): string {
  return execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

const uninspectable = (message: string, command: string, cause?: unknown): Observation<never> =>
  unobservable(new ProcessInspectionError(message, { cause, details: { command } }));

/* **pid は在ったのに作業ディレクトリを 1 つも引けなかったのは、数えられなかったのと同じ。**
   0 件と返せば「どのプロセスも動いていない」と読まれ、待っているセッションが全部終了へ倒れる。 */
function placedOrUninspectable(
  processes: readonly LiveProcess[],
  command: string,
  cause: unknown,
): Observation<readonly LiveProcess[]> {
  if (processes.length > 0) return observed(processes);
  return uninspectable('Could not locate the working directory of any agent', command, cause);
}

/* 落ちたコマンドが、そこまでに返していた出力。execFileSync がエラーに載せてくる。

   **最後まで書けていない行は捨てる。** バッファが溢れた(ENOBUFS)ときやシグナルで殺された
   とき、出力は行の途中で切れる。切れた `n/Volumes/repo/glass` をそのまま読むと、プロセスの
   作業ディレクトリを `/Volumes/repo/glass` だと言うことになり、上位のプロジェクトに当たって
   別のプロジェクトの待機として数えられる。間違ったパスを渡すくらいなら、その 1 行は
   無かったことにする。正常に終わった出力は必ず改行で終わるので、そのときに落ちるものは無い。 */
function rescuedStdout(error: unknown): string {
  const stdout = (error as { readonly stdout?: unknown } | null | undefined)?.stdout;
  const text =
    typeof stdout === 'string' ? stdout : Buffer.isBuffer(stdout) ? stdout.toString('utf8') : '';
  const lastBreak = text.lastIndexOf('\n');
  return lastBreak < 0 ? '' : text.slice(0, lastBreak + 1);
}

/* `ps -axo pid=,comm=` の出力から claude の pid だけを拾う。

   コマンド名がパス付きで出る機械があるので、最後の `/` から後ろだけを見る。
   `claude-code` や `myclaude` は別物なので、丸ごと一致したものだけを取る。 */
function parseClaudePids(psOutput: string): number[] {
  const pids: number[] = [];
  for (const rawLine of psOutput.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    const space = line.search(/\s/);
    if (space < 0) continue;
    const command = line.slice(space).trim();
    if (command.split('/').pop() !== 'claude') continue;
    const pid = Number(line.slice(0, space));
    if (!Number.isInteger(pid)) continue;
    pids.push(pid);
  }
  return pids;
}

/* `lsof -Fn` の出力をパースする。`p<pid>` の行の後に `n<path>` の行が続く形式で、
   パスは直前に出た pid のもの。それ以外のフィールドの行は関わりが無いので読み飛ばす。 */
function parseLsofCwd(lsofOutput: string): LiveProcess[] {
  const processes: LiveProcess[] = [];
  let pid = 0;
  for (const line of lsofOutput.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || 0;
    else if (line.startsWith('n') && pid > 0) processes.push({ pid, cwd: line.slice(1) });
  }
  return processes;
}

/* Linux は pid ごとに直に引ける。

   **引けなかった 1 つは落として先へ進む。** 数えている間に終わった・覗く権限が無いだけで、
   残りのプロセスは数えられる。ここで諦めると、見えている分まで見えなくなる。 */
function placeViaProc(pids: readonly number[]): Observation<readonly LiveProcess[]> {
  const processes: LiveProcess[] = [];
  let lastError: unknown;
  for (const pid of pids) {
    try {
      processes.push({ pid, cwd: fs.readlinkSync(`/proc/${pid}/cwd`) });
    } catch (error) {
      lastError = error;
    }
  }
  return placedOrUninspectable(processes, '/proc/<pid>/cwd', lastError);
}

/* 他の機械は lsof に引かせる。

   **非ゼロで終わっても、受け取れた分は捨てない。** lsof は頼んだ pid の 1 つでも見失うと
   エラーとして終わるが、そこまでの出力は先に返している。数えている間に 1 つ終わるのは
   よくあることなので、ここで全部を投げるとプロジェクトがしょっちゅう「数えられない」に倒れる。 */
function placeViaLsof(
  pids: readonly number[],
  run: (file: string, args: readonly string[]) => string,
): Observation<readonly LiveProcess[]> {
  const args = ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'];
  // 包むのは lsof を起こすところだけ。パースまで包むと、パースの穴が lsof の失敗に化ける
  let output: string;
  try {
    output = run('lsof', args);
  } catch (error) {
    return placedOrUninspectable(parseLsofCwd(rescuedStdout(error)), 'lsof', error);
  }
  return placedOrUninspectable(parseLsofCwd(output), 'lsof', undefined);
}

export function createOsAgentProcessIntegration(
  options?: OsAgentProcessOptions,
): AgentProcessIntegration {
  const run = options?.run ?? runCommand;
  const platform = options?.platform ?? process.platform;

  return {
    async list(): Promise<Observation<readonly LiveProcess[]>> {
      let psOutput: string;
      try {
        // `=` はヘッダーを消す。pid とコマンド名だけが並ぶ
        psOutput = run('ps', ['-axo', 'pid=,comm=']);
      } catch (error) {
        return uninspectable('Could not count live agents', 'ps', error);
      }

      const pids = parseClaudePids(psOutput);
      // ここだけが本当の 0 件。ps は答えたが、claude は 1 つも居なかった
      if (pids.length === 0) return observed([]);

      // pid は分かった。あとは作業ディレクトリを引くだけで、引けなければ何件がどこで生きているか言えない
      return platform === 'linux' ? placeViaProc(pids) : placeViaLsof(pids, run);
    },
  };
}
