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

/* ローカルの `preferences.json` を、ファイル 1 つで持つ。

   **glasshive で唯一の書き込みである。** 観測元へは何一つ書かない、という決めを守るために、
   書く前のガードをここへ焼き込んである。呼ぶ側が渡すのは材料(いま観測しているプロジェクト
   のパス)だけで、書いてよいかを決めるのは呼ぶ側ではない。

   預かるのはテキストだけで、その意味は見ない。設定として読めるかを決めるのは呼ぶ側の
   仕事で、ここはテキストを置いてテキストを返す保存先である。保存先が意味を読み始めると、
   保存の仕組みを差し替えるたびに読める形が枝分かれする。

   置き換えは一時ファイル + rename。途中で落ちても、壊れた `preferences.json` が残らない。 */

export const PREFERENCES_FILE_NAME = 'preferences.json';

/* `preferences.json` の保存先。

   **`configDir` へ `glasshive` をもう一度足さない。** `currentSettings().configDir` は
   `GLASSHIVE_CONFIG_DIR ?? (XDG_CONFIG_HOME ?? ~/.config)/glasshive` で、
   既に末尾の `glasshive` を含んでいる。足すと `~/.config/glasshive/glasshive/…` になる。 */
export function preferencesFilePath(configDir: string): string {
  return path.join(configDir, PREFERENCES_FILE_NAME);
}

/* 観測元のルート。**何があってもこの下へは書かない。**

   呼ぶ側から受け取らないのは、受け取れば外せてしまうからである。
   ここは決めごとであって、設定ではない。

   `~/.claude` だけでは足りない。`transcript` のルートは環境変数で移せるので、移した先も
   同じだけガードしないと、移した機械でだけガードが外れる。環境変数を読むのを呼ぶ側に
   任せずここで読むのは、ガードの材料を渡す側が決められると、渡し忘れが穴になるからである。 */
function observationRoots(): readonly string[] {
  return [path.join(os.homedir(), '.claude'), currentSettings().transcriptsRoot];
}

/* パスを、実際に在るところまで遡って本当のパスへ正規化する。

   **文字列だけで見比べるとガードを擦り抜ける。** 観測元へ向けた symlink を保存先に渡せば、
   文字列の上では外に見えて、書き込みは中へ落ちる。大小を区別しないファイルシステムでは
   `.CLAUDE` が `.claude` の外に見えて、同じディレクトリへ書ける。どちらも実際に確かめた。

   まだ無いパスは解決できないので、在る祖先まで遡って解決し、残りの要素を継ぎ足す。
   端まで解決できたかを一緒に返すのは、解決できなかった分だけ見比べを厳しくするためである。 */
interface Canonical {
  /** 正規化したパス。解決できたところまでは本当のパスで、その先は渡されたパスのまま */
  readonly path: string;
  /** 端まで解決できたか。できていなければ、そのパスが本当のパスだとは言えない */
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

/* ルートが保存先を含むか。

   判定の芯は `containsPath`。名前の頭が同じだけの隣を中と見なさない — そこで緩めると、
   `/w/proj` を観測しているだけで `/w/project-notes` への書き込みまで断ることになる
   (逆に、緩い前方一致は本当に守るべきパスを取り違える)。

   どちらかがまだ無いときは、大文字小文字を正規化した文字列でも見比べる。大小を区別しない
   ファイルシステムでは `.CLAUDE` は `.claude` と同じディレクトリだが、まだ無いうちは
   本当のパスへ正規化できず、文字列の上では外に見える。そのまま作れば、後から同じ
   ディレクトリとして開かれ、観測元の中に `preferences.json` が居ることになる。
   端まで解決できた同士でだけ、文字列のとおりに見比べる。**確かめられない側では書かない。** */
function rootContains(root: Canonical, target: Canonical): boolean {
  if (containsPath(root.path, target.path)) return true;
  if (root.exact && target.exact) return false;
  return containsPath(root.path.toLowerCase(), target.path.toLowerCase());
}

/** 観測できなかったのか、無いだけなのかを errno から見分ける */
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

/* プロジェクトの中で、glasshive が実際に読みに行くもの。

   **断るのは読む先であって、プロジェクトそのものではない。** プロジェクトは人の作業
   ディレクトリで、`~` を作業ディレクトリにして走らせた履歴があれば `~` 自体がプロジェクトに
   なる。プロジェクトごと断ると、`~` の下にある既定の保存先(`~/.config/glasshive`)にも
   置けず、ピン留めが一切できなくなる。読みに行く先へは絶対に書かないという芯は、この 2 つと
   `~/.claude`・`transcript` のルートで足りる。 */
const READ_INSIDE_NEST = ['.beads', '.git'] as const;

/* 書いてよいパスかを見る。断る理由が在ればそれを返す。

   見比べる前に、両側とも `canonicalize` で本当のパスへ正規化する。片側だけ正規化すると、
   symlink で入れ替えた保存先がルートと噛み合わなくなる。 */
function refusalFor(
  target: string,
  observedRoots: readonly string[],
): PreferencesRefusedError | undefined {
  if (!isSafeAbsolutePath(target)) {
    return new PreferencesRefusedError('The preferences directory is not a usable path');
  }
  const canonical = canonicalize(target);

  for (const root of observationRoots()) {
    /* ルートがパスとして使えないなら、どこが観測元なのかをこちらが言えていない。
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
    // プロジェクトのパスは材料でしかない。使えない文字列は判定に足さないだけで、断りにはしない
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
        /* 読めたテキストはそのまま返す。**壊れているかをここで決めない** —
           設定として読めるかは呼ぶ側が見る。 */
        return observed(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        return classifyLoadFailure(error, file);
      }
    },

    async save(document, { observedRoots }): Promise<Result<void>> {
      const refused = refusalFor(file, observedRoots);
      // 断りは投げない。置けなかったという事実であって、こちらの穴ではない
      if (refused !== undefined) return err(refused);

      /* 一時ファイルの名前は毎回ちがうものにする。予測できる名前(pid など)だと、書く前に
         その名前で観測元へ向けた symlink を置いておく手が通る。symlink を辿った書き込みは
         ガードの外へ落ちるので、名前を当てさせない。 */
      const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        /* `preferences.json` はこの機械のこの人の持ち物。他人に読ませる理由が無い。
           `wx` で作る — 既に在るものへは書かない。symlink が置かれていれば辿らずに躓く。 */
        fs.writeFileSync(temporary, document, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
        /* 差し替えは rename ひとつで済ませる。書き掛けのテキストが本体に見えることが無く、
           途中で落ちても残るのは一時ファイルだけで、`preferences.json` は前のまま読める。 */
        fs.renameSync(temporary, file);
        return ok(undefined);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        // 書き掛けを片付ける。残すと、保存先に読めないファイルが溜まっていく
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
