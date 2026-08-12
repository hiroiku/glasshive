import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE } from '~/interface/i18n/locale.ts';
import { createTranslator, type Translator } from '~/interface/i18n/translator.ts';

/* 画面へ出す言葉を組み立てる呼び出し。

   言葉を選ぶ入れ物(`LocaleContext.tsx`)とは別のファイルに置く。**あちらはサーバーの関数を
   呼ぶので、それを読み込むだけでブラウザーの側にサーバー側の仕組みが引き込まれる。**
   画面のコンポーネントが要るのは `t` だけなので、ここだけを読み込めるようにしてある。 */

/* 入れ物の外で描かれたときに使う呼び出し。**入れ物の中の既定と同じものである** ——
   別に作ると、入れ物の外で描いた画面だけが別の言葉になる。純関数へ渡す `t` もこれでよい。 */
export const defaultTranslator: Translator = createTranslator(DEFAULT_LOCALE);

export const TranslatorContext = createContext<Translator>(defaultTranslator);

/** 画面へ出す言葉を組み立てる呼び出し */
export const useT = (): Translator => useContext(TranslatorContext);
