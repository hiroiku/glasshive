import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

/* 道案内の組み立て。

   問い合わせの器を道の context に載せておくと、道の loader からも画面からも同じ器を使える。
   観測は時とともに変わり続けるので、遷移のときだけ取り直す loader だけでは足りない —
   合図が来たら捨てて取り直す、という流れの中心がこの器である。 */

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        /* 取り直しの引き金は合図だけにする。窓を離れて戻るたびに全部を読み直すと、
           観ているだけで機械が忙しくなる。 */
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

    /* 器を焼くときに描かれるのは、道の中身ではなくこれである。

       **これを置かないと、器は空のまま焼かれる。** ブラウザーは器を引き継ぐときに
       道の中身を描くので、空の器と食い違い、React が木を丸ごと作り直す。
       同じものを両側で描かせておけば、引き継ぎは静かに済む。 */
    defaultPendingComponent: () => <p className="empty">観ています…</p>,
    /* 待ちの姿を、待たせてから出すのではなく最初から出す。器には既に描かれているので、
       ここで間を置くと、その間だけブラウザー側が空になって食い違う。 */
    defaultPendingMs: 0,

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
