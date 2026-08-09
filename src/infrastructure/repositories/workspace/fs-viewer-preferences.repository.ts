import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { containsPath, isSafeAbsolutePath } from '~/app-kernel/path.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { currentSettings } from '~/infrastructure/config/paths.ts';
import {
  PreferencesReadError,
  PreferencesRefusedError,
  PreferencesWriteError,
} from '~/infrastructure/errors/workspace/preferences-store.error.ts';

/* 手元の覚え書きを、ファイル 1 つで持つ。

   **この道具で唯一の書き込みである。** 観測元へは何一つ書かない、という決めを守るために、
   書く前の見張りをここへ焼き込んである。呼ぶ側が渡すのは材料(いま観測している巣の場所)
   だけで、書いてよいかを決めるのは呼ぶ側ではない。

   **預かるのは字だけで、その意味は見ない。** 選びとして読めるかを決めるのは呼ぶ側の仕事で、
   ここは字を置いて字を返す棚である。棚が意味を読み始めると、置き場を差し替えるたびに
   読める形が枝分かれする。

   置き換えは一時ファイル + rename。途中で落ちても、壊れた覚え書きが残らない。 */

export const PREFERENCES_FILE_NAME = 'preferences.json';

/* 覚え書きの置き場。

   **`configDir` へ `glasshive` をもう一度足さない。** `currentSettings().configDir` は
   `GLASSHIVE_CONFIG_DIR ?? (XDG_CONFIG_HOME ?? ~/.config)/glasshive` で、
   既に末尾の `glasshive` を含んでいる。足すと `~/.config/glasshive/glasshive/…` になる。 */
export function preferencesFilePath(configDir: string): string {
  return path.join(configDir, PREFERENCES_FILE_NAME);
}

/* 観測元の根。**何があってもこの下へは書かない。**

   呼ぶ側から受け取らないのは、受け取れば外せてしまうからである。
   ここは決めごとであって、設定ではない。

   家の `~/.claude` だけでは足りない。正本の置き場は環境変数で移せるので、移した先も
   同じだけ見張らないと、移した機械でだけ見張りが外れる。環境を読むのを呼ぶ側に任せず
   ここで読むのは、見張りの材料を渡す側が決められると、渡し忘れが穴になるからである。 */
function observationRoots(): readonly string[] {
  return [path.join(os.homedir(), '.claude'), currentSettings().transcriptsRoot];
}

/* 場所を、実際に在るところまで遡って本当の字へ均す。

   **字だけで見比べると見張りを擦り抜ける。** 観測元へ向けた繋ぎ(symlink)を置き場に
   渡せば、字の上では外に見えて、書き込みは中へ落ちる。大小を区別しない仕組みの上では
   `.CLAUDE` が `.claude` の外に見えて、同じ棚へ書ける。どちらも実際に確かめた。

   まだ無い場所は解けないので、在る祖先まで遡って解き、残りの名前を継ぎ足す。
   端まで解けたかを一緒に返すのは、解けなかった分だけ見比べを厳しくするためである。 */
interface Canonical {
  /** 均した字。解けたところまでは本当の字で、その先は渡された字のまま */
  readonly path: string;
  /** 端まで解けたか。解けていなければ、その字が本当の字だとは言えない */
  readonly exact: boolean;
}

function canonicalize(value: string): Canonical {
  const resolved = path.resolve(value);
  const tail: string[] = [];
  let current = resolved;
  for (;;) {
    try {
      return {
        path: path.join(fs.realpathSync.native(current), ...tail),
        exact: tail.length === 0,
      };
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return { path: resolved, exact: false };
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

/* 根が置き場を含むか。

   判定の芯は `containsPath`。**名前の頭が同じだけの隣を中と見なさない** — そこで緩めると、
   `/w/proj` を観測しているだけで `/w/project-notes` への書き込みまで断ることになる
   (逆に、緩い前方一致は本当に守るべき場所を取り違える)。

   **どちらかがまだ無いときは、大小を畳んだ字でも見比べる。** 大小を区別しない仕組みでは
   `.CLAUDE` は `.claude` と同じ棚だが、まだ無いうちは本当の字へ均せず、字の上では外に見える。
   そのまま作れば、後から同じ棚として開かれ、観測元の中に覚え書きが居ることになる。
   端まで解けた同士でだけ、字のとおりに見比べる。**確かめられない側では書かない。** */
function rootContains(root: Canonical, target: Canonical): boolean {
  if (containsPath(root.path, target.path)) return true;
  if (root.exact && target.exact) return false;
  return containsPath(root.path.toLowerCase(), target.path.toLowerCase());
}

/** 見に行けなかったのか、無いだけなのかを errno から見分ける */
function classifyLoadFailure(error: unknown, file: string): Observation<never> {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return absent('no-source');
  return unobservable(
    new PreferencesReadError(`Could not read ${file}`, {
      cause: error,
      details: { code },
    }),
  );
}

/* 巣の中で、この道具が実際に読みに行くもの。

   **断るのは読む先であって、巣そのものではない。** 巣は人の作業場所で、家(`~`)を
   作業場所にして走らせた履歴があれば家そのものが巣になる。巣ごと断ると、家の下にある
   既定の置き場(`~/.config/glasshive`)にも置けず、留めることが一切できなくなる。
   読みに行く先へは絶対に書かないという芯は、この 2 つと `~/.claude`・正本の置き場で足りる。 */
const READ_INSIDE_NEST = ['.beads', '.git'] as const;

/* 書いてよい場所かを見る。断る理由が在ればそれを返す。

   見比べる前に、両側とも `canonicalize` で本当の字へ均す。片側だけ均すと、
   繋ぎで入れ替えた置き場が根と噛み合わなくなる。 */
function refusalFor(
  target: string,
  observedRoots: readonly string[],
): PreferencesRefusedError | undefined {
  if (!isSafeAbsolutePath(target)) {
    return new PreferencesRefusedError('The preferences directory is not a usable path');
  }
  const canonical = canonicalize(target);

  for (const root of observationRoots()) {
    /* 根が場所として使えないなら、どこが観測元なのかをこちらが言えていない。
       言えないまま書くより断る。**確かめられない側では書かない。** */
    if (!isSafeAbsolutePath(root)) {
      return new PreferencesRefusedError(
        'Could not resolve where glasshive observes from — refusing to write unchecked',
        {
          details: { reason: 'unknown-observation-root' },
        },
      );
    }
    if (rootContains(canonicalize(root), canonical)) {
      return new PreferencesRefusedError(
        `${target} is inside an observation source — glasshive never writes there`,
        { details: { reason: 'observation-root' } },
      );
    }
  }

  for (const root of observedRoots) {
    // 巣の場所は材料でしかない。使えない字は判定に足さないだけで、断りにはしない
    if (!isSafeAbsolutePath(root)) continue;
    for (const material of READ_INSIDE_NEST) {
      if (rootContains(canonicalize(path.join(root, material)), canonical)) {
        return new PreferencesRefusedError(
          `${target} is inside what glasshive reads — it never writes where it reads`,
          { details: { reason: 'observed-material', material } },
        );
      }
    }
  }
  return undefined;
}

export function createFsViewerPreferencesRepository(options: {
  readonly configDir: string;
}): ViewerPreferencesRepository {
  const file = preferencesFilePath(options.configDir);

  return {
    async load(): Promise<Observation<string>> {
      try {
        /* 読めた字はそのまま返す。**壊れているかをここで決めない** —
           字が選びとして読めるかは呼ぶ側が見る。 */
        return observed(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        return classifyLoadFailure(error, file);
      }
    },

    async save(document, { observedRoots }): Promise<Result<void>> {
      const refused = refusalFor(file, observedRoots);
      // 断りは投げない。置けなかったという事実であって、こちらの穴ではない
      if (refused !== undefined) return err(refused);

      /* 一時ファイルの名前は毎回ちがう字にする。読める字(pid など)だと、書く前に
         その名前で観測元へ向けた繋ぎを置いておく手が通る。繋ぎを辿った書き込みは
         見張りの外へ落ちるので、名前を当てさせない。 */
      const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        /* 覚え書きはこの機械のこの人の持ち物。他人に読ませる理由が無い。
           `wx` で作る — 既に在るものへは書かない。繋ぎが置かれていれば辿らずに躓く。 */
        fs.writeFileSync(temporary, document, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
        /* 差し替えは rename ひとつで済ませる。書き掛けの字が本体に見えることが無く、
           途中で落ちても残るのは一時ファイルだけで、覚え書きは前のまま読める。 */
        fs.renameSync(temporary, file);
        return ok(undefined);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        // 書き掛けを片付ける。残すと、置き場に読めない字が溜まっていく
        try {
          fs.rmSync(temporary, { force: true });
        } catch {}
        return err(
          new PreferencesWriteError(`Could not save preferences to ${file}`, {
            cause: error,
            details: { code },
          }),
        );
      }
    },
  };
}
