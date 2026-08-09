export interface Args {
  port: number;
  activeThresholdSecs: number;
  open: boolean;
  configDir: string | undefined;
}

/* 待ち受ける番号は盤で `HIVE` を打った数字。番号そのものではなく名前で思い出せる。
   一時ポート(49152 以上)より下なので、外向きの繋ぎに先に取られることがない。 */
export const DEFAULTS = { port: 4483, activeThresholdSecs: 60 } as const;

export const HELP = `glasshive — 働くエージェントを、ガラス越しに観る

使い方: glasshive [options]

  --port <n>                 待ち受ける番号(127.0.0.1 のみ。既定 ${DEFAULTS.port})
  --active-threshold <secs>  最後の書き込みから何秒までを「稼働」と見るか(既定 ${DEFAULTS.activeThresholdSecs})
  --config-dir <path>        手元の覚え書きを置く場所(既定 ~/.config/glasshive)
  --no-open                  ブラウザーを自動で開かない
  -h, --help                 この案内を出す

観る範囲は指定しない。エージェントが動いた巣はすべて一覧に出て、
タブに並べるものは観る人が選ぶ — どこから起動しても同じものが見える。
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
            message: `--port の値が読めません: ${raw ?? '(無し)'}\n`,
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
            message: `--active-threshold の値が読めません: ${raw ?? '(無し)'}\n`,
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
            message: '--config-dir の値が空です\n',
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
          message: `--global は要らなくなりました(いまは常にすべての巣を観ます)\n\n${HELP}`,
          exitCode: 2,
        };
      default:
        if (a !== undefined && !a.startsWith('-')) {
          return {
            ok: false,
            message:
              `場所の指定は受け付けません: ${a}\n` +
              `観る範囲は起動では決めません。すべての巣が一覧に出るので、` +
              `タブに並べるものは画面で選んでください\n\n${HELP}`,
            exitCode: 2,
          };
        }
        return {
          ok: false,
          message: `知らない指定です: ${a}\n\n${HELP}`,
          exitCode: 2,
        };
    }
  }

  return { ok: true, args };
}
