import os from 'node:os';
import path from 'node:path';

/* どこを読み、どこに `preferences.json` を置くか。

   ランチャーは `tsc` で別にビルドされるので、サーバーバンドルとは別の実体になる。設定は
   環境変数で渡す — これが 2 つを繋ぐ唯一の手段である。テストもここを差し替えて、本物の
   ホームディレクトリに触れずに済ませる。 */

export interface Settings {
  /** `transcript` のルート。~/.claude/projects */
  transcriptsRoot: string;
  /** `preferences.json` を置くディレクトリ。glasshive 自身の持ち物で、観測元ではない */
  configDir: string;
  /** 最後の書き込みから何ミリ秒までを「稼働」と見るか */
  activeThresholdMs: number;
  /* 起動のときに名指されたディレクトリ。絶対パスで、名指されていなければ `null`。

     **観測してよい範囲ではない。** どこを開いて、どこから先に読むかを決めるだけで、
     名指されていてもいなくても、観測するのは `~/.claude/projects` の全部である。 */
  target: string | null;
}

const DEFAULT_ACTIVE_THRESHOLD_MS = 60_000;

export function currentSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const home = os.homedir();

  const rawThreshold = Number(env.GLASSHIVE_ACTIVE_THRESHOLD_MS);
  const activeThresholdMs =
    Number.isFinite(rawThreshold) && rawThreshold >= 0 ? rawThreshold : DEFAULT_ACTIVE_THRESHOLD_MS;

  return {
    transcriptsRoot: env.GLASSHIVE_PROJECTS_ROOT ?? path.join(home, '.claude', 'projects'),
    // XDG に従う。従わない機械でも ~/.config へ落ちる
    configDir:
      env.GLASSHIVE_CONFIG_DIR ??
      path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'glasshive'),
    activeThresholdMs,
    target: env.GLASSHIVE_TARGET ?? null,
  };
}
