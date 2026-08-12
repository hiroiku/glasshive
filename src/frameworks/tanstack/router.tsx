import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { NotObserved } from './ui/components/primitives/NotObserved.tsx';
import { ReadProgress } from './ui/components/primitives/ReadProgress.tsx';
import { crashTrouble, routeTrouble } from './ui/derive/trouble.ts';

/* ルーターの組み立て。

   `QueryClient` をルーターの context に載せておくと、ルートの loader からも画面からも
   同じインスタンスを使える。観測は時とともに変わり続けるので、遷移のときだけ取り直す
   loader だけでは足りない — 変更通知が来たら捨てて取り直す、という流れの中心が
   この `QueryClient` である。 */

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        /* 取り直しの引き金は変更通知だけにする。ウィンドウを離れて戻るたびに全部を
           読み直すと、観ているだけで機械が忙しくなる。 */
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: false,
      },
    },
  });

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',

    /* HTML シェルをビルドするときに描かれるのは、ルートの中身ではなくこれである。

       **これを置かないと、シェルは空のままビルドされる。** ブラウザーは hydrate のときに
       ルートの中身を描くので、空のシェルと食い違い、React が DOM を丸ごと作り直す。
       同じものを両側で描かせておけば、hydrate は静かに済む。 */
    /* 何を待っているのかまで言う。**割合は出せない** —— ここはまだ何も読めていない時点で、
       分母を持たない。8 秒を過ぎてから足す 1 行が食い違いにならないのは、それを出すのが
       `useEffect` のタイマーだからである。シェルを描くときには走らないので、hydrate する
       その瞬間はどちらの側にもこの 1 行が無い。 */
    defaultPendingComponent: () => (
      <ReadProgress
        label="Starting glasshive"
        slowNote="The first read of ~/.claude/projects takes a moment."
      />
    ),
    /* 待ちの表示を、間を置いてからではなく最初から出す。HTML シェルには既に描かれて
       いるので、ここで間を置くと、その間だけブラウザー側が空になって食い違う。 */
    defaultPendingMs: 0,

    /* 落ちたときと、無い URL を開いたとき。**ルーターの既定の画面をそのまま出さない** ——
       素の英文とスタックだけが出て、観測できなかったのか glasshive が壊れたのかが読み分けられない。 */
    defaultErrorComponent: ({ error }) => <NotObserved {...crashTrouble(error)} />,
    defaultNotFoundComponent: () => (
      <NotObserved {...routeTrouble(globalThis.location?.pathname ?? '')} />
    ),

    context: { queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
