import { mdiBeehiveOutline, mdiBellOffOutline, mdiBellOutline } from '@mdi/js';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useMatchRoute,
} from '@tanstack/react-router';
import { useMemo } from 'react';
import type { TreeJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { Icon } from '../ui/components/primitives/Icon.tsx';
import { TabBar } from '../ui/components/tabs/TabBar.tsx';
import { requestNoticePermission, useAwaitingNotice } from '../ui/hooks/useAwaitingNotice.ts';
import { type ChangeStreamState, useChangeStream } from '../ui/hooks/useChangeStream.ts';
import { useHydrated } from '../ui/hooks/useHydrated.ts';
import { useTabSelection } from '../ui/hooks/useTabSelection.ts';
import { useTabShortcuts } from '../ui/hooks/useTabShortcuts.ts';
import { PrefsProvider, usePrefs } from '../ui/prefs/PrefsContext.tsx';
import '../ui/styles/index.css';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'glasshive' },
    ],
  }),
  shellComponent: RootDocument,
  component: Root,
});

/* HTML シェルだけ。SPA なので、ここだけがビルド時に一度描かれ、以降はブラウザーが
   中身を入れ替える。 */
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/* 好みはルートより上に置く。ルートを移っても保つものなので、ルートの中に持たせると
   画面を移るたびに読み直され、そのたびにパネルの出方が跳ねる。 */
function Root() {
  return (
    <PrefsProvider>
      <Chrome />
    </PrefsProvider>
  );
}

export interface TopCounts {
  readonly active: number;
  readonly waiting: number;
  readonly ended: number;
  readonly input: number;
  /* 数え落としたプロジェクトが在るか。**在るなら、この数はまだ最終ではない** —
     読み終える前の 0 を数え終えた 0 と同じ顔で出すと、待っている人が居ないことになる。 */
  readonly partial: boolean;
  /* 数え上げられなかったプロジェクトが在るか。**`partial` の理由がどちらなのかを言うために持つ。**

     読んでいる途中なら待てば揃う。数え上げられなかったのなら、待っても揃わない。
     同じ文で伝えると、ユーザーはいつまでも揃うのを待つことになる。 */
  readonly unreadable: boolean;
}

/** 全部のセッションを数えて 1 行にする。**待っている数を落とさない** */
export function countsOf(tree: TreeJson | undefined): TopCounts {
  const counts = { active: 0, waiting: 0, ended: 0, input: 0 };
  /* `~/.claude/projects` を走査できなかったときは、数えた相手が 1 つも無い。
     観測できなかったことを 0 として断定させない。
     ディレクトリが無かった(`absent`)ときの 0 は、断定してよい観測である。 */
  let unreadable = tree !== undefined && tree.sources.state === 'unobservable';
  // 木がまだ届いていないあいだも、数えた相手が 1 つも無い
  let partial = tree === undefined;
  for (const project of tree?.projects ?? []) {
    /* 走査できなかったプロジェクトの行は一覧に残り、`sessions` が空のまま読み終える。
     **その 0 を数え終えた 0 と同じ顔で出すのが、この数のいちばん静かな嘘である。** */
    if (project.sources.state === 'unobservable') unreadable = true;
    // 読んでいないプロジェクトは `sessions` が空である。足さずに、足さなかったことを言う
    if (!project.read) {
      partial = true;
      continue;
    }
    for (const session of project.sessions) {
      counts[session.state] += 1;
      if (session.awaiting === 'user') counts.input += 1;
    }
  }
  return { ...counts, partial: partial || unreadable, unreadable };
}

/* 変更通知の届き方を 1 つの点で言う。**繋がっていることと、更新が届くことは別である** —
   サーバーがウォッチャーを張れていなければ、SSE が開いたまま画面は二度と変わらない。

   点の色だけでは読み上げに「●」しか届かないので、`role="status"` と読める文を持たせる。 */
export function ConnStatus({ connected, watching }: ChangeStreamState) {
  const tone = !connected ? 'off' : watching ? 'on' : 'stale';
  const label = !connected
    ? 'Realtime connection: disconnected'
    : watching
      ? 'Realtime connection: connected'
      : 'Realtime connection: connected, but the watcher is down — updates will not arrive';
  return (
    <span id="conn" className={tone} role="status" title={label}>
      <span aria-hidden="true">●</span>
      <span className="vhidden">{label}</span>
    </span>
  );
}

/* 上部バーとタブ行。どの画面に居ても同じものが出るので、`__root` に置く。

   タブ行がここに在るのは、画面を移ってもタブが描き直されないためである。
   画面の側に置くと、移るたびに並びが組み直されて、位置で覚えている手が狂う。

   変更通知を受けるのもここである。SSE は 1 本だけ張って、来たものをキャッシュへ配る。 */
const brand = (
  <>
    <Icon path={mdiBeehiveOutline} size={15} /> glasshive
  </>
);

function Chrome() {
  const tree = useQuery(treeQuery);
  const tabs = useTabSelection();
  const prefs = usePrefs();
  const stream = useChangeStream();
  const hydrated = useHydrated();
  const matchRoute = useMatchRoute();
  const match = matchRoute({ to: '/projects/$slug', fuzzy: true });
  const current = match === false ? null : match.slug;

  const counts = useMemo(() => countsOf(tree.data), [tree.data]);
  useAwaitingNotice(tree.data, prefs.notify);
  useTabShortcuts({
    visible: tabs.visibleTabs,
    pinned: tabs.selection.pinned,
    current,
    onMove: tabs.movePin,
  });

  const toggleNotify = async () => {
    // 入れるときだけ尋ねる。切るのに許可は要らない
    if (!prefs.notify && !(await requestNoticePermission())) return;
    prefs.set({ notify: !prefs.notify });
  };

  /* まだ数え終えていない合計にはその旨を添える。**付けないと、途中の数が最終の数に見える。**
     走査できなかったのか、読んでいる途中なのかで、添える文が違う。 */
  const partialMark = counts.partial ? (
    <span
      className="dimtxt"
      title={
        counts.unreadable
          ? 'Some projects could not be read — the count may be short'
          : 'Counted from the projects read so far'
      }
    >
      +?
    </span>
  ) : null;

  return (
    <>
      <header id="topbar">
        {/* hydrate 前は素の `<a>` として出す。`Link` は「いま居るルートか」を属性として
            書き込むので、HTML シェルに焼くとその状態が Overview のものに固まり、
            別のルートを直に開いたユーザーと食い違う */}
        {hydrated ? (
          <Link to="/" id="brand">
            {brand}
          </Link>
        ) : (
          <a id="brand" href="/">
            {brand}
          </a>
        )}
        <span id="counts">
          active <b className="active">{counts.active}</b>
          {partialMark} / waiting <b className="waiting">{counts.waiting}</b>
          {partialMark}
          {counts.input > 0 && (
            <>
              {' '}
              / input <b className="input">{counts.input}</b>
              {partialMark}
            </>
          )}{' '}
          / ended <b className="ended">{counts.ended}</b>
          {partialMark}
        </span>
        <button
          type="button"
          id="notify-toggle"
          className={prefs.notify ? 'on' : ''}
          /* 名前は状態で変えない。切り替わるのは `aria-pressed` のほうで、
             名前まで変わると、押した後に別のボタンになったように読まれる */
          aria-label="Notify when a session starts awaiting input"
          aria-pressed={prefs.notify}
          title={
            prefs.notify
              ? 'Notifications on: alerts you when a session starts awaiting input (only while the window is unfocused)'
              : 'Notifications off — click to enable'
          }
          onClick={() => void toggleNotify()}
        >
          <Icon path={prefs.notify ? mdiBellOutline : mdiBellOffOutline} size={14} />
        </button>
        {/* 更新が届いていないことは隠さない。届いていないのに静かなだけに見えると、
            ユーザーは「何も起きていない」と読む */}
        <ConnStatus connected={stream.connected} watching={stream.watching} />
      </header>

      <TabBar
        visible={tabs.visibleTabs}
        pinned={tabs.selection.pinned}
        projects={tree.data?.projects}
        onUnpin={tabs.togglePin}
        onPin={tabs.togglePin}
        onMove={tabs.movePin}
        current={current}
      />

      <Outlet />
    </>
  );
}
