import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* 見た目の好み。**URL の検索パラメータには載せない。**

   パネルの出方も幅も、その人の画面の都合であって「この条件で見て」と人に渡すものではない。
   URL に載せると、渡した先の画面がこちらの都合で組み替わる。

   複数のルートを跨いで読むので、props で配らずにここへ集める。 */

const STORAGE_KEY = 'glasshive-prefs';

export interface Prefs {
  /* パネルの出方。並置(本文を狭める)か、重なり(本文の上に滑り出す)か。
     既定を並置にしてあるのは、会話と表を見比べるのが glasshive の主な使い方だからである。 */
  readonly dock: boolean;
  readonly drawerWidth: number | null;
  /** 終わったものも全部出すか */
  readonly showAll: boolean;
  /** 応答待ちになったら OS に知らせるか */
  readonly notify: boolean;
}

const DEFAULT_PREFS: Prefs = {
  dock: true,
  drawerWidth: null,
  showAll: false,
  notify: false,
};

export interface PrefsStore extends Prefs {
  set(patch: Partial<Prefs>): void;
}

const PrefsContext = createContext<PrefsStore | null>(null);

/** `localStorage` に覚えている文字列を読む。読めなければ既定に戻す — **好みが壊れても観測は止まらない** */
function loadPrefs(): Prefs {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS;
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return DEFAULT_PREFS;
  }
  if (typeof stored !== 'object' || stored === null) return DEFAULT_PREFS;
  const record = stored as Record<string, unknown>;
  const read = <K extends keyof Prefs>(key: K, guard: (value: unknown) => boolean): Prefs[K] =>
    Object.hasOwn(record, key) && guard(record[key])
      ? (record[key] as Prefs[K])
      : DEFAULT_PREFS[key];
  return {
    dock: read('dock', (value) => typeof value === 'boolean'),
    drawerWidth: read(
      'drawerWidth',
      (value) => value === null || (typeof value === 'number' && Number.isFinite(value)),
    ),
    showAll: read('showAll', (value) => typeof value === 'boolean'),
    notify: read('notify', (value) => typeof value === 'boolean'),
  };
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  /* 読むのはマウントしてから一度だけ。**最初の描画では読まない** — HTML シェル
     (`_shell.html`)はビルド時に誰の好みも知らないまま描かれるので、最初の描画で読むと
     その人の好みのぶんだけ食い違う。 */
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setLoaded(true);
  }, []);

  useEffect(() => {
    // 読む前に書くと、覚えていた文字列を既定で塗り潰す
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // 覚えられない環境では、その場かぎりの好みとして扱う
    }
  }, [prefs, loaded]);

  /* パネルの出方は body に付ける。滑り出しと並置は入れ物の外側の話なので、
     コンポーネントの中では表せない。 */
  useEffect(() => {
    document.body.classList.toggle('drawer-dock', prefs.dock);
  }, [prefs.dock]);

  const set = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const store = useMemo<PrefsStore>(() => ({ ...prefs, set }), [prefs, set]);
  return <PrefsContext.Provider value={store}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsStore {
  const store = useContext(PrefsContext);
  // 好みを持たない場所で好みを読もうとしたなら、それは組み立ての誤りである
  if (store === null) throw new Error('usePrefs used outside PrefsProvider');
  return store;
}
