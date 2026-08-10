import { useNavigate } from '@tanstack/react-router';
import { createContext, useContext, useMemo } from 'react';
import type { ProjectSearch } from './search.ts';

/* 画面を渡り歩くためのコンテキスト。

   どこからでも `useNav()` を呼べるので、ルーターを props で通す必要が無い。

   ここが薄いのは、行き先がすべて URL の検索パラメータだからである。パネルを開くのは
   検索パラメータを書き換えることで、開いたという状態はどこにも持たない。おかげで
   **ブラウザーの戻るがそのまま効く** — 開いたパネルは 1 つ戻れば閉じる。 */

export interface Nav {
  /** 会話のパネルを開く。指すのは `transcript` のパス */
  openConv(file: string): void;
  openIssue(id: string): void;
  openRef(rev: string, label: string): void;
  /** Git の画面へ移り、その語で絞る */
  gotoGit(token: string): void;
  /** 課題の画面へ移り、その語で絞る */
  gotoBeads(token: string): void;
  closePanel(): void;
}

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const navigate = useNavigate();

  const nav = useMemo<Nav>(() => {
    /* 検索パラメータは足すだけにする。**他のパラメータを消さない。** 消すと、パネルを
       開いただけで絞り込みも並べ替えも初期値へ戻り、見ていた画面が失われる。 */
    const patch = (next: Partial<ProjectSearch>) => {
      void navigate({
        to: '.',
        search: (prev: ProjectSearch) => ({ ...prev, ...next }),
      });
    };
    const toView = (view: 'git' | 'beads', token: string) => {
      void navigate({
        to: `/projects/$slug/${view}`,
        params: { slug },
        search: (prev: ProjectSearch) => ({ ...prev, q: token }),
      });
    };

    return {
      openConv: (file) => patch({ panel: 'conv', pv: file, pl: undefined }),
      openIssue: (id) => patch({ panel: 'issue', pv: id, pl: undefined }),
      openRef: (rev, label) => patch({ panel: 'ref', pv: rev, pl: label }),
      gotoGit: (token) => toView('git', token),
      gotoBeads: (token) => toView('beads', token),
      closePanel: () => patch({ panel: undefined, pv: undefined, pl: undefined }),
    };
  }, [navigate, slug]);

  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(NavContext);
  // `NavProvider` の外で `useNav()` を呼んだなら、それは組み立ての誤りである
  if (nav === null) throw new Error('useNav was called outside NavProvider');
  return nav;
}
