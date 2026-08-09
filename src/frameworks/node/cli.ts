export interface Args {
  port: number;
  activeThresholdSecs: number;
  open: boolean;
  configDir: string | undefined;
}

/* 待ち受ける番号は盤で `HIVE` を打った数字。番号そのものではなく名前で思い出せる。
   一時ポート(49152 以上)より下なので、外向きの繋ぎに先に取られることがない。 */
export const DEFAULTS = { port: 4483, activeThresholdSecs: 60 } as const;

export const HELP = `glasshive — watch your AI agents work, through glass

Usage: glasshive [options]

  --port <n>                 Port to listen on (bound to 127.0.0.1 only; default ${DEFAULTS.port})
  --active-threshold <secs>  Seconds since the last write to still count as "active" (default ${DEFAULTS.activeThresholdSecs})
  --config-dir <path>        Where local preferences are kept (default ~/.config/glasshive)
  --no-open                  Do not open the browser automatically
  -h, --help                 Show this help

Scope is not set at startup. Every project an agent has worked in is listed, and
the viewer picks which ones to keep as tabs — the same things are visible no
matter where you start from.
`;

export type ParseResult =
  | { ok: true; args: Args }
  | { ok: false; message: string; exitCode: number };

/* 引数を読む。読めない求めは黙って既定に倒さず、断る —
   渡した指定が効いていないことに気づけないまま観るのが、いちばん困る。 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const args: Args = {
    port: DEFAULTS.port,
    activeThresholdSecs: DEFAULTS.activeThresholdSecs,
    open: true,
    configDir: undefined,
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
      /* 観る範囲を起動で決める指定は無くなった。黙って無視すると、
         渡した人は「絞ったつもり」で全部を見ることになる。 */
      case '--global':
        return {
          ok: false,
          message: `--global is no longer needed (every project is always observed)\n\n${HELP}`,
          exitCode: 2,
        };
      default:
        if (a !== undefined && !a.startsWith('-')) {
          return {
            ok: false,
            message:
              `path arguments are not accepted: ${a}\n` +
              `Scope is not set at startup. Every project is listed, so pick ` +
              `the ones to keep as tabs in the browser\n\n${HELP}`,
            exitCode: 2,
          };
        }
        return {
          ok: false,
          message: `unknown option: ${a}\n\n${HELP}`,
          exitCode: 2,
        };
    }
  }

  return { ok: true, args };
}
