import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { treeQuery } from './queries/tree.query.ts';
import { routeTree } from './routeTree.gen';
import { NotObserved } from './ui/components/primitives/NotObserved.tsx';
import { ReadProgress } from './ui/components/primitives/ReadProgress.tsx';
import { transcriptScan } from './ui/derive/sources.ts';
import { crashTrouble, routeTrouble } from './ui/derive/trouble.ts';
import { useT } from './ui/i18n/useT.ts';

/* ルーターの組み立て。

   `QueryClient` をルーターの context に載せておくと、ルートの loader からも画面からも
   同じインスタンスを使える。観測は時とともに変わり続けるので、遷移のときだけ取り直す
   loader だけでは足りない — 変更通知が来たら捨てて取り直す、という流れの中心が
   この `QueryClient` である。 */

/* 待ちと、落ちたときと、無い URL。**中で `t()` を呼ぶために、名前付きの
   コンポーネントにしてある** —— ルーターへその場で渡す関数の中では、hook を呼べる保証が無い。

   ここは言葉を選ぶ入れ物より外で描かれることが在る。そのときは英語のまま出る —— 落ちた画面が
   さらに落ちるより、読める英語が出るほうがよい。 */

/* 起動を待っているあいだ。**何を待っているのかを名指す。** 誰もが必ず一度は見る待ちなので、
   ここが黙っていると、glasshive は最初に「しばらく黙るもの」として憶えられる。

   索引が届いていれば、そこに `transcript` の本数が在る。`enabled: false` で加わるのは、
   **ここが読み取りを始める場所ではない**からである —— 始めるのはルートの loader で、
   ここは既に走っている読み取りの進み具合を写すだけである。届いていなければ輪郭だけのバーで、
   それは「まだ何も観測していない」という正しい姿である。 */
function StartingView() {
  const t = useT();
  const tree = useQuery({ ...treeQuery, enabled: false });
  return (
    <ReadProgress
      label={t('Starting glasshive')}
      slowNote={t('The first read of ~/.claude/projects takes a moment.')}
      scan={transcriptScan(t, tree.data)}
    />
  );
}

function CrashView({ error }: { error: unknown }) {
  const t = useT();
  return <NotObserved {...crashTrouble(t, error)} />;
}

function NoRouteView() {
  const t = useT();
  return <NotObserved {...routeTrouble(t, globalThis.location?.pathname ?? '')} />;
}

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
    /* 何を待っているのかまで言う。**シェルには割合が出ない** —— ビルドの時点では索引が
       まだ無く、`enabled: false` はそれを取りに行かないので、hydrate するその瞬間は
       どちらの側も輪郭だけのバーである。塗り始めるのは索引が届いてからで、それは
       hydrate より後になる。8 秒を過ぎてから足す 1 行が食い違わないのも同じ理由で、
       それを出すのは `useEffect` のタイマーである。 */
    defaultPendingComponent: () => <StartingView />,
    /* 待ちの表示を、間を置いてからではなく最初から出す。HTML シェルには既に描かれて
       いるので、ここで間を置くと、その間だけブラウザー側が空になって食い違う。 */
    defaultPendingMs: 0,

    /* 落ちたときと、無い URL を開いたとき。**ルーターの既定の画面をそのまま出さない** ——
       素の英文とスタックだけが出て、観測できなかったのか glasshive が壊れたのかが読み分けられない。 */
    defaultErrorComponent: ({ error }) => <CrashView error={error} />,
    defaultNotFoundComponent: () => <NoRouteView />,

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
