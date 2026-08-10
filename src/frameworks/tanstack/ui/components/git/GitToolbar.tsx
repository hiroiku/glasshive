import { mdiSourceBranch } from '@mdi/js';
import type React from 'react';
import { Icon } from '../primitives/Icon.tsx';

/* Git 画面のツールバー。検索と、比較の相手と、いま見えている数。

   **検索しても行は消えない。** 一致しない行を沈めるだけにしてある — 消すと線が途中で
   切れて、残った行がどこから来たのか読めなくなる。 */

export interface GitToolbarProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** 比べる相手。ふつうは本流のブランチ */
  readonly base: string;
  /** 検索しているときの一致件数。検索していなければ `null` */
  readonly matches: number | null;
  readonly tips: number;
  readonly worktrees: number;
  readonly branches: number;
  /* 検索欄より先に置くもの。Work の画面で行の単位を選ぶ切り替えがここへ入る。

     **一致件数はここから出し続ける。** 数え方を表と分けると、沈んだ行の数と
     ツールバーに出た数が食い違い、どちらが本当か分からなくなる。 */
  readonly lead?: React.ReactNode | undefined;
}

export function GitToolbar({
  query,
  onQuery,
  base,
  matches,
  tips,
  worktrees,
  branches,
  lead,
}: GitToolbarProps) {
  return (
    <div className="view-toolbar">
      {lead}
      <input
        className="search"
        type="search"
        placeholder="Search refs & commits…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <span className="g-base">
        <Icon path={mdiSourceBranch} size={12} /> {base}
      </span>
      <span className="g-note">
        {matches === null
          ? `${tips} live lines · ${worktrees} worktrees · ${branches} branches`
          : `${matches} matches`}
      </span>
    </div>
  );
}
