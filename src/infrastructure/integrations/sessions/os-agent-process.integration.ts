import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type {
  AgentProcessIntegration,
  LiveProcess,
} from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import { ProcessInspectionError } from '~/infrastructure/errors/sessions/transcript-read.error.ts';

/* OS に生きている道具を数えさせる。

   `ps` で `claude` という名の番号を集め、その番号ごとに作業場所を引く。場所の引き方は
   機械で違う — Linux は `/proc/<pid>/cwd` の readlink、それ以外は `lsof -d cwd`。

   **数えられなかったことを 0 件に潰さない。** 0 件と答えると待機の枠がなくなり、待って
   いるセッションが残らず「終わった」ものとして並ぶ。しかも観る人からは、その巣が静まり
   返っているようにしか見えない。だから 0 件と言うのは **`ps` が答えたうえで `claude` が
   1 つも居なかったときだけ** で、番号は在ったのに場所を 1 つも置けなかったときは
   見に行けなかったとして返す。

   逆に、見えた分を捨てもしない。一部だけ引けなかったのは、その 1 つを落として先へ進む。

   引いた作業場所はそのまま渡す。`lsof -d cwd` も `/proc/<pid>/cwd` も元から解決済みの
   場所を返すので、掛け直す必要が無い。 */

export interface OsAgentProcessOptions {
  /** 検査で差し替える。既定は node:child_process の execFileSync を包んだもの */
  readonly run?: (file: string, args: readonly string[]) => string;
  readonly platform?: NodeJS.Platform;
}

/* 既定の起こし方。**落ちたら投げる。**
   ここで空文字に均すと、答えが空だったのか起こせなかったのかを上で分けられなくなる。 */
function runCommand(file: string, args: readonly string[]): string {
  return execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

const uninspectable = (message: string, command: string, cause?: unknown): Observation<never> =>
  unobservable(new ProcessInspectionError(message, { cause, details: { command } }));

/* **番号が在ったのに 1 つも場所を置けなかったのは、数えられなかったのと同じ。**
   0 件と返せば「どの道具も動いていない」と読まれ、待っているセッションが全部終了へ倒れる。 */
function placedOrUninspectable(
  processes: readonly LiveProcess[],
  command: string,
  cause: unknown,
): Observation<readonly LiveProcess[]> {
  if (processes.length > 0) return observed(processes);
  return uninspectable('Could not locate the working directory of any agent', command, cause);
}

/* 落ちた命令が、そこまでに返していた答え。execFileSync が誤りに載せてくる。

   **最後まで書けていない行は捨てる。** 受け皿が溢れた(ENOBUFS)ときや合図で殺されたとき、
   答えは行の途中で切れる。切れた `n/Volumes/repo/glass` をそのまま読むと、道具の作業場所を
   `/Volumes/repo/glass` だと言うことになり、上の巣に当たって**別の巣の待機として数えられる**。
   間違った場所を渡すくらいなら、その 1 行は無かったことにする。
   ちゃんと終わった答えは必ず改行で終わるので、正常な場合に落ちるものは無い。 */
function rescuedStdout(error: unknown): string {
  const stdout = (error as { readonly stdout?: unknown } | null | undefined)?.stdout;
  const text =
    typeof stdout === 'string' ? stdout : Buffer.isBuffer(stdout) ? stdout.toString('utf8') : '';
  const lastBreak = text.lastIndexOf('\n');
  return lastBreak < 0 ? '' : text.slice(0, lastBreak + 1);
}

/* `ps -axo pid=,comm=` の答えから claude の番号だけを拾う。

   名前は道つきで出る機械があるので、最後の区切りから後ろだけを見る。
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

/* `lsof -Fn` の答えを読み解く。番号の行 `p<pid>` の後に場所の行 `n<path>` が続く形式で、
   場所は直前に出た番号のもの。それ以外の名札の行は関わりが無いので読み飛ばす。 */
function parseLsofCwd(lsofOutput: string): LiveProcess[] {
  const processes: LiveProcess[] = [];
  let pid = 0;
  for (const line of lsofOutput.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || 0;
    else if (line.startsWith('n') && pid > 0) processes.push({ pid, cwd: line.slice(1) });
  }
  return processes;
}

/* Linux は番号ごとに直に引ける。

   **引けなかった 1 つは落として先へ進む。** 数えている間に終わった・覗く権利が無いだけで、
   残りの道具は数えられる。ここで諦めると、見えている分まで見えなくなる。 */
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

   **非ゼロで終わっても、受け取れた分は捨てない。** lsof は頼んだ番号の 1 つでも見失うと
   誤りとして終わるが、残りの答えは先に返している。数えている間に 1 つ終わるのはよくある
   ことなので、ここで全部を投げると巣がしょっちゅう「数えられない」に倒れる。 */
function placeViaLsof(
  pids: readonly number[],
  run: (file: string, args: readonly string[]) => string,
): Observation<readonly LiveProcess[]> {
  const args = ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'];
  // 包むのは lsof を起こすところだけ。読み解きまで包むと、読み解きの穴が lsof の失敗に化ける
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
        // `=` は見出しを消す。番号と名前だけが並ぶ
        psOutput = run('ps', ['-axo', 'pid=,comm=']);
      } catch (error) {
        return uninspectable('Could not count live agents', 'ps', error);
      }

      const pids = parseClaudePids(psOutput);
      // ここだけが本当の 0 件。ps は答えたが、claude は 1 つも居なかった
      if (pids.length === 0) return observed([]);

      // 番号は分かった。あとは場所を引くだけで、引けなければ何件がどこで生きているか言えない
      return platform === 'linux' ? placeViaProc(pids) : placeViaLsof(pids, run);
    },
  };
}
