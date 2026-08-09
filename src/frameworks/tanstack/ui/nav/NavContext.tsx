import { useNavigate } from '@tanstack/react-router';
import { createContext, useContext, useMemo } from 'react';
import type { ProjectSearch } from './search.ts';

/* 画面を渡り歩く口。

   旧実装はこれを 9 つのファイル・30 か所以上に props で通していた。どこからでも
   道を呼べるので、通す必要が無い。**この移し替えで得られる最大の簡素化である。**

   ここが薄いのは、行き先がすべて道の印だからである。窓を開くのは印を書き換えることで、
   開いたという覚えはどこにも持たない。おかげで **戻る印がそのまま効く** —
   旧実装は履歴を差し替えるだけだったので、開いた窓から戻れなかった。 */

export interface Nav {
  /** 会話の窓を開く。指すのは正本の在り処 */
  openConv(file: string): void;
  openIssue(id: string): void;
  openRef(rev: string, label: string): void;
  /** 記録の画面へ移り、その語で絞る */
  gotoGit(token: string): void;
  /** 課題の画面へ移り、その語で絞る */
  gotoBeads(token: string): void;
  closePanel(): void;
}

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const navigate = useNavigate();

  const nav = useMemo<Nav>(() => {
    /* 印は足すだけにする。**他の印を消さない。** 消すと、窓を開いただけで
       絞り込みも並べ替えも初期値へ戻り、観ていた盤面が失われる。 */
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
  // 道を持たない場所で道を呼ぼうとしたなら、それは組み立ての誤りである
  if (nav === null) throw new Error('NavProvider の外で道を呼ぼうとした');
  return nav;
}
