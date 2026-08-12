import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { DEFAULT_LOCALE, type Locale, negotiateLocale } from '~/interface/i18n/locale.ts';
import { createTranslator } from '~/interface/i18n/translator.ts';
import type { PreferencesJson } from '~/interface/presenters/workspace/preferences.presenter.ts';
import { setPreferences } from '../../functions/preferences.ts';
import { preferencesQuery, preferencesQueryKey } from '../../queries/preferences.query.ts';
import { TranslatorContext } from './useT.ts';

/* 画面の言葉。**選んだ言葉と、当てた言葉を分けて持つ。**

   選んだ言葉は `preferences.json` に在る。選んでいない人には、ブラウザーが名乗る言葉を
   当てる。当てたものを「選んだ」として保存しないので、ブラウザーの言葉を変えた人は
   何も操作しなくても画面がついてくる。

   ルートより上に置く。画面を移るたびに読み直すと、そのたびに言葉が英語へ跳ねる。 */

export interface LocaleHandle {
  /** いま出している言葉。選んでいなければブラウザーから当てたもの */
  readonly locale: Locale;
  /** その人が選んだ言葉。まだ選んでいなければ `null` */
  readonly chosen: Locale | null;
  /** `null` を渡すと選ぶのをやめ、ブラウザーの言葉へ戻る */
  readonly choose: (locale: Locale | null) => void;
}

const LocaleContext = createContext<LocaleHandle | null>(null);

/* ブラウザーが名乗る言葉。**最初の描画では見に行かない** —— HTML シェル(`_shell.html`)は
   ビルド時に誰の言葉も知らないまま描かれるので、最初の描画で見に行くとその人の言葉のぶんだけ
   食い違う。 */
const browserLocale = (): Locale =>
  typeof navigator === 'undefined' ? DEFAULT_LOCALE : negotiateLocale([...navigator.languages]);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const query = useQuery(preferencesQuery);
  const chosen = query.data?.locale ?? null;

  const mutation = useMutation({
    mutationFn: async (locale: Locale | null) => {
      const response = await setPreferences({ data: { action: 'locale', locale } });
      // 断られたことを通ったことにすると、選び直したはずの言葉が次に開いたときに戻る
      if (!response.ok) throw new Error(response.body.message);
      return response.body;
    },
    /* 置きに行く前に画面を切り替える。言葉を選ぶのは自分の画面の話でしかなく、
       観測を待つ理由が無い。置けなかったときは元へ戻す。 */
    onMutate: async (locale) => {
      await client.cancelQueries({ queryKey: preferencesQueryKey });
      const previous = client.getQueryData<PreferencesJson>(preferencesQueryKey);
      if (previous !== undefined) {
        client.setQueryData<PreferencesJson>(preferencesQueryKey, { ...previous, locale });
      }
      return { previous };
    },
    onError: (_error, _locale, context) => {
      if (context?.previous !== undefined) {
        client.setQueryData(preferencesQueryKey, context.previous);
      }
    },
    onSuccess: (saved) => client.setQueryData(preferencesQueryKey, saved),
  });

  /* `preferences.json` がまだ届いていない間は英語のままにする。ブラウザーの言葉へ先に倒すと、
     選んで英語にしている人の画面が、開くたびに一度だけ別の言葉を通る。 */
  const locale = chosen ?? (query.isFetched ? browserLocale() : DEFAULT_LOCALE);
  const translator = useMemo(() => createTranslator(locale), [locale]);

  /* 出している言葉を文書にも書く。**書かないと、行の折り返しとフォントの選び方が
     文字だけを見て決まる。** 同じ漢字を日本語と中国語で違う形に描くのはこの属性である。 */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const handle = useMemo<LocaleHandle>(
    () => ({ locale, chosen, choose: (next) => mutation.mutate(next) }),
    [locale, chosen, mutation.mutate],
  );

  return (
    <LocaleContext.Provider value={handle}>
      <TranslatorContext.Provider value={translator}>{children}</TranslatorContext.Provider>
    </LocaleContext.Provider>
  );
}

/** 言葉の選び直し。選ぶ画面だけが要る */
export function useLocaleChoice(): LocaleHandle {
  const handle = useContext(LocaleContext);
  if (handle === null) throw new Error('useLocaleChoice must be used inside LocaleProvider');
  return handle;
}
