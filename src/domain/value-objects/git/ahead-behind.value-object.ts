/* 本流との隔たり。先へ何節進んでいて、何節取り残されているか。

   `rev-list --count` は数だけを 1 行で答える。数として読めない答え(空・非ゼロで終わった
   ときの空文字)は 0 として扱う。**0 は「隔たりが無い」と読めてしまう**が、隔たりを
   数え損ねたことを先端ごとに持ち回ると木の形が二重になるので、旧実装と同じ扱いにしてある。 */

export interface AheadBehind {
  readonly ahead: number;
  readonly behind: number;
}

export const parseCommitCount = (text: string): number => Number(text.trim()) || 0;
