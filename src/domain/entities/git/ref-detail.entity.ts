import type { CommitSummary } from '~/domain/value-objects/git/commit-summary.value-object.ts';
import type { DiffFileStat, DiffStat } from '~/domain/value-objects/git/diff-stat.value-object.ts';

/* `ref` 1 つを近くで観たもの。

   並べるのは「本流にまだ入っていないコミット」で、それが 1 つも無いときだけ直近のコミットに落とす。
   どちらを並べたのかは `unique` に残す — 同じ一覧でも意味がまるで違うからである。 */

export interface RefDetail {
  readonly rev: string;
  /** 何と比べたか。比べる相手が決まらなければ無い */
  readonly base: string | null;
  /** 並んでいるのが「本流に入っていないコミット」か。false なら直近のコミットである */
  readonly unique: boolean;
  readonly commits: readonly CommitSummary[];
  /** 分かれ目から先の差分ぜんぶの数え上げ。比べる相手が無ければ無い */
  readonly stat: DiffStat | null;
  readonly behind: number;
  readonly files: readonly DiffFileStat[];
}
