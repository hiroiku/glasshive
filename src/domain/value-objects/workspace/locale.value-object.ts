/* 画面の言葉をどれで出すか。

   縛るのは我々が書いた言葉だけである。観測したもの — 課題の題名、ラベル、ログイン名、
   ブランチの名前、コミットの題、セッションの題、ファイルのパス、`transcript` の中身、
   `AppError.code` — は誰か別の人が書いたテキストで、読んだままの姿で出る。
   **観測したものを言い換える観測ツールは、観測について嘘をついている。**

   一覧が閉じているのは、同梱したカタログとフォントの範囲が、そのまま出せる範囲だからである。
   知らない綴りは既定へ倒す。倒さずに受けると、英語のまま出ている画面が
   「その言葉で出している」と名乗ることになる。 */

export const LOCALES = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko'] as const;

export type Locale = (typeof LOCALES)[number];

/** 書いた言葉そのもの。翻訳の元がこれなので、読めない選択はここへ倒す */
export const DEFAULT_LOCALE: Locale = 'en';

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
