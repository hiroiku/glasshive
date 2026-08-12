/* 画面に出せる言葉の一覧を、内側の層の外へ渡す。

   **一覧そのものはここに無い。** 持っているのは `domain` の側で、ここは名前を通すだけである。
   写す側が自分の一覧を持つと、言葉を足した日にどちらかが取り残される。

   通すだけの薄いファイルをわざわざ置いてあるのは、**ブラウザーへ届く側がここを通るため**である。
   `preferences.json` を読む処理と同じファイルから渡すと、言葉の一覧を 1 つ引いただけで
   その処理が抱えている `node:` の一式まで client のバンドルに繋がる。 */

export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from '~/domain/value-objects/workspace/locale.value-object.ts';
