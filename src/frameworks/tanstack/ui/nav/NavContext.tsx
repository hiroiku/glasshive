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
  /** Work の画面のブランチへ移り、その語で絞る */
  gotoBranch(token: string): void;
  /** Work の画面の課題へ移り、その語で絞る */
  gotoIssues(token: string): void;
  /** Work の画面の課題へ移り、そのマイルストーンだけに絞る */
  gotoMilestone(title: string): void;
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
    /* 単位まで指して移る。**画面は 1 つなので、行き先は単位の切り替えである** —
       ブランチの語で課題の一覧へ落とすと、当たらない絞り込みだけが残る。 */
    const toWork = (unit: ProjectSearch['unit'], token: string) => {
      void navigate({
        to: '/projects/$slug/work',
        params: { slug },
        search: (prev: ProjectSearch) => ({ ...prev, unit, q: token }),
      });
    };

    return {
      openConv: (file) => patch({ panel: 'conv', pv: file, pl: undefined }),
      openIssue: (id) => patch({ panel: 'issue', pv: id, pl: undefined }),
      openRef: (rev, label) => patch({ panel: 'ref', pv: rev, pl: label }),
      gotoBranch: (token) => toWork('branches', token),
      gotoIssues: (token) => toWork(undefined, token),
      /* マイルストーンから課題へ落とすときは、単位も検索語も置き換える。**`q` は消す** —
         前の単位で打った語がそのまま残ると、絞り込みが二重に掛かって空の一覧になる。 */
      gotoMilestone: (title) =>
        void navigate({
          to: '/projects/$slug/work',
          params: { slug },
          search: (prev: ProjectSearch): ProjectSearch => ({
            ...prev,
            unit: undefined,
            ms: title,
            q: undefined,
          }),
        }),
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
