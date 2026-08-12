import { statSync } from 'node:fs';
import path from 'node:path';

export interface Args {
  /* 待ち受けるポート。**渡されなかったときは `undefined` である** — 既定から順に空きを
     探してよいのは、こちらが決めた番号のときだけである。名指されたら、その番号で待つ。 */
  port: number | undefined;
  activeThresholdSecs: number;
  open: boolean;
  configDir: string | undefined;
  /** 名指されたディレクトリ。絶対パスに直してある。渡されなければ Overview を開く */
  target: string | undefined;
}

/* 待ち受けるポートは、電話のキーパッドで `HIVE` を打った数字。数字そのものではなく
   名前で思い出せる。一時ポート(49152 以上)より下なので、外向きの接続に先に取られない。 */
export const DEFAULTS = { port: 4483, activeThresholdSecs: 60 } as const;

export const HELP = `glasshive — watch your AI agents work, through glass

Usage: glasshive [path] [options]

  [path]                     Open this directory instead of the whole hive.
                             Relative or absolute, and it resolves to the repository
                             it belongs to.

  --port <n>                 Port to listen on (bound to 127.0.0.1 only; default ${DEFAULTS.port},
                             which falls through to the next free port when taken)
  --active-threshold <secs>  Seconds since the last write to still count as "active" (default ${DEFAULTS.activeThresholdSecs})
  --config-dir <path>        Where local preferences are kept (default ~/.config/glasshive)
  --no-open                  Do not open the browser automatically
  -h, --help                 Show this help

With no path, every project an agent has worked in is listed, and the viewer picks
which ones to keep as tabs. With a path, that one repository fills the window — the
rest is still observed, and the hive is one click away.

Running glasshive again does not start a second server. It hands the path to the one
already listening and opens that window, reusing the scan and the index it has built.
`;

export type ParseResult =
  | { ok: true; args: Args }
  | { ok: false; message: string; exitCode: number };

/** ディレクトリかどうかを尋ねる相手。テストは本物のファイルを置かずに答えられる */
export interface CliEnvironment {
  readonly cwd: string;
  readonly isDirectory: (path: string) => boolean;
}

const REAL_ENVIRONMENT: CliEnvironment = {
  cwd: process.cwd(),
  isDirectory: (target) => {
    try {
      return statSync(target).isDirectory();
    } catch {
      /* 読めないものは名指せない。**理由は分けない** — 無いのも権限が無いのも、
         ここでできるのは「開けない」と言うことだけである */
      return false;
    }
  },
};

/* 引数を読む。読めない引数は黙って既定値に倒さず、断る —
   渡した指定が効いていないことに気づけないまま観るのが、いちばん困る。 */
export function parseArgs(
  argv: readonly string[],
  environment: CliEnvironment = REAL_ENVIRONMENT,
): ParseResult {
  const args: Args = {
    port: undefined,
    activeThresholdSecs: DEFAULTS.activeThresholdSecs,
    open: true,
    configDir: undefined,
    target: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--no-open':
        args.open = false;
        break;
      case '-h':
      case '--help':
        return { ok: false, message: HELP, exitCode: 0 };
      case '--port': {
        const raw = argv[++i];
        const n = Number(raw);
        if (raw === undefined || !Number.isInteger(n) || n < 0 || n > 65535) {
          return {
            ok: false,
            message: `invalid --port value: ${raw ?? '(none)'}\n`,
            exitCode: 2,
          };
        }
        args.port = n;
        break;
      }
      case '--active-threshold': {
        const raw = argv[++i];
        const n = Number(raw);
        if (raw === undefined || !Number.isFinite(n) || n < 0) {
          return {
            ok: false,
            message: `invalid --active-threshold value: ${raw ?? '(none)'}\n`,
            exitCode: 2,
          };
        }
        args.activeThresholdSecs = n;
        break;
      }
      case '--config-dir': {
        const raw = argv[++i];
        if (raw === undefined || raw === '') {
          return {
            ok: false,
            message: 'missing --config-dir value\n',
            exitCode: 2,
          };
        }
        args.configDir = raw;
        break;
      }
      /* 観測する範囲は起動時には決められない。黙って無視すると、渡したユーザーは
         指定が効いたものと思い込むので、受け取った時点で断る。 */
      case '--global':
        return {
          ok: false,
          message: `--global is no longer needed (every project is always observed)\n\n${HELP}`,
          exitCode: 2,
        };
      default: {
        if (a === undefined || a.startsWith('-')) {
          return {
            ok: false,
            message: `unknown option: ${a}\n\n${HELP}`,
            exitCode: 2,
          };
        }
        /* 開く先は 1 つである。2 つ渡されたら、どちらを開いたかが画面から読めない
           まま片方だけが開くことになるので、受け取った時点で断る。 */
        if (args.target !== undefined) {
          return {
            ok: false,
            message: `only one path can be opened: ${args.target} and ${path.resolve(environment.cwd, a)}\n`,
            exitCode: 2,
          };
        }
        const target = path.resolve(environment.cwd, a);
        /* 開けないパスは、開いた後に「何も無い」と言うのではなく、ここで断る。
           **無かったのと観測できなかったのを分けるのは、観測したものについての話である。**
           名指した相手そのものが開けないなら、それは観測ではなく打ち間違いである。 */
        if (!environment.isDirectory(target)) {
          return {
            ok: false,
            message: `not a directory: ${a}\n`,
            exitCode: 2,
          };
        }
        args.target = target;
        break;
      }
    }
  }

  return { ok: true, args };
}
