import os from 'node:os';
import path from 'node:path';

/* どこを読み、どこに覚え書きを置くか。

   起動口は tsc で別に組まれるので、束ね役とは別の実体になる。設定は環境変数で渡す —
   これが 2 つを繋ぐ唯一の道である。検査もここを差し替えて、本物の家に触れずに済ませる。 */

export interface Settings {
  /** 正本の置き場。~/.claude/projects */
  transcriptsRoot: string;
  /** 手元の覚え書きを置く場所。この道具自身の持ち物で、観測元ではない */
  configDir: string;
  /** 最後の書き込みから何ミリ秒までを「稼働」と見るか */
  activeThresholdMs: number;
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
  };
}
