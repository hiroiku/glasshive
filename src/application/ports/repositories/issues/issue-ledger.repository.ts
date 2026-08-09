import type { Observation } from '~/app-kernel/observation.ts';

/* 課題台帳を読む口。

   **口が返すのは素材だけである。** 台帳の置き場も errno も外へ出さないが、課題という
   言葉も出さない。字をどう読み解くかは application の仕事で、実装は在るか・読めたか・
   読めた字だけを答える。

   `Observation` を返す。台帳が無い巣と、台帳を読めなかった巣は別の事実で、どちらも
   空の一覧になるので、ここで分けておかないと二度と分けられない。errno が見えるのは
   実装の側だけなので、分けられる場所もそこしかない。

   `projectPath` は**解決の済んだ巣の場所**である。求めから来た字をそのまま渡してはいけない。
   相対の名前を渡すと、開くのは走らせた場所の台帳になり、**別の巣の課題が尋ねた巣の課題として
   返る**。実装はそれを断るが、断るのは最後の砦であって、読んでよい場所を決める場所ではない。 */

export interface IssueLedgerRepository {
  /* 台帳ひとつぶんの生の字。一覧も 1 件も、この字から起こす。

     台帳が無ければ `absent('no-source')` — bd を使っていない巣はこうなる。
     観測としては成り立っているので、誤りではない。 */
  readLedgerText(projectPath: string): Promise<Observation<string>>;
}
