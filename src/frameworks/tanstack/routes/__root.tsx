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
import { useChangeStream } from '../ui/hooks/useChangeStream.ts';
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

/* 器だけ。SPA なので、ここだけが組み立て時に一度描かれ、以降はブラウザーが中身を入れ替える。 */
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
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

/* 好みは道より上に置く。道を移っても保つものなので、道の中に持たせると
   画面を移るたびに読み直され、そのたびに窓の出方が跳ねる。 */
function Root() {
  return (
    <PrefsProvider>
      <Chrome />
    </PrefsProvider>
  );
}

/** 全部のセッションを数えて 1 行にする。**待っている数を落とさない** */
function countsOf(tree: TreeJson | undefined) {
  const counts = { active: 0, waiting: 0, ended: 0, input: 0 };
  for (const project of tree?.projects ?? []) {
    for (const session of project.sessions) {
      counts[session.state] += 1;
      if (session.awaiting === 'user') counts.input += 1;
    }
  }
  return counts;
}

/* 上の帯とタブ行。どの画面に居ても同じものが出るので、道の根に置く。

   タブ行がここに在るのは、画面を移ってもタブが描き直されないためである。
   画面の側に置くと、移るたびに並びが組み直されて、位置で覚えている手が狂う。

   合図を受けるのもここである。1 本だけ張って、来たものを覚えの側へ配る。 */
const brand = (
  <>
    <Icon path={mdiBeehiveOutline} size={15} /> Glasshive
  </>
);

function Chrome() {
  const tree = useQuery(treeQuery);
  const tabs = useTabSelection();
  const prefs = usePrefs();
  const connected = useChangeStream();
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
    // 入れるときだけ尋ねる。切るのに許しは要らない
    if (!prefs.notify && !(await requestNoticePermission())) return;
    prefs.set({ notify: !prefs.notify });
  };

  return (
    <>
      <header id="topbar">
        {/* 載る前は素の行き先として出す。Link は「いま居る道か」を印として書き込むので、
            器に焼くとその印が一覧のものに固まり、別の道を直に開いた人と食い違う */}
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
          active <b className="active">{counts.active}</b> / waiting{' '}
          <b className="waiting">{counts.waiting}</b>
          {counts.input > 0 && (
            <>
              {' '}
              / input <b className="input">{counts.input}</b>
            </>
          )}{' '}
          / ended <b className="ended">{counts.ended}</b>
        </span>
        <label id="filter-toggle">
          <input
            type="checkbox"
            checked={prefs.showAll}
            onChange={(event) => prefs.set({ showAll: event.target.checked })}
          />{' '}
          Show all ended
        </label>
        <button
          type="button"
          id="notify-toggle"
          className={prefs.notify ? 'on' : ''}
          title={
            prefs.notify
              ? '知らせあり: 返事待ちになったら、画面を観ていないときだけ知らせる'
              : '知らせなし — 押すと入れる'
          }
          onClick={() => void toggleNotify()}
        >
          <Icon path={prefs.notify ? mdiBellOutline : mdiBellOffOutline} size={14} />
        </button>
        {/* 繋がっていないことは隠さない。合図が来ていないのに静かなだけに見えると、
            観る人は「何も起きていない」と読む */}
        <span
          id="conn"
          className={connected ? 'on' : ''}
          title={connected ? '合図の道は繋がっている' : '合図の道が切れている'}
        >
          ●
        </span>
      </header>

      <TabBar
        visible={tabs.visibleTabs}
        projects={tree.data?.projects ?? []}
        onUnpin={tabs.togglePin}
        current={current}
        showAll={prefs.showAll}
      />

      <Outlet />
    </>
  );
}
