import {
  mdiChevronLeft,
  mdiChevronRight,
  mdiDockRight,
  mdiPictureInPictureBottomRightOutline,
} from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { treeQuery } from '../queries/tree.query.ts';
import { Icon } from '../ui/components/primitives/Icon.tsx';
import { NavProvider, useNav } from '../ui/nav/NavContext.tsx';
import { openPanelOf, type ProjectSearch, parseProjectSearch } from '../ui/nav/search.ts';
import { usePrefs } from '../ui/prefs/PrefsContext.tsx';

/* プロジェクト 1 つぶんの画面の枠。`#subbar`・本文・パネル・`#rail`。

   **パネルをここに置く。** ビューを移っても組み直されないので、会話を開いたまま
   Agents と Git を行き来できる。ビューの側に置くと、移るたびに会話が最初から読み直される。 */

export const Route = createFileRoute('/projects/$slug')({
  validateSearch: parseProjectSearch,
  loader: ({ context }) => {
    // 先に走らせるだけで、待たない。待つと、それぞれの画面が持つ「まだ何も無いときの案内」が消える
    void context.queryClient.ensureQueryData(treeQuery);
  },
  component: ProjectLayout,
});

/* サイドパネルの中身は、パネルを開いたときに読み込む。

   会話と課題の本文は Markdown レンダラーとシンタックスハイライタを連れてくる。これらは
   パネルの中でしか使わないので、一緒にバンドルすると Agents も Git も Beads も、
   開きもしないパネルのぶんを毎回読み込むことになる。分けたぶん、`ref` のパネルを
   開いても Markdown 側は付いてこない。 */
const ConvPanel = lazy(() =>
  import('../ui/components/conversation/ConvPanel.tsx').then((it) => ({ default: it.ConvPanel })),
);
const IssueDetail = lazy(() =>
  import('../ui/components/panels/IssueDetail.tsx').then((it) => ({ default: it.IssueDetail })),
);
const RefDetailPanel = lazy(() =>
  import('../ui/components/panels/RefDetailPanel.tsx').then((it) => ({
    default: it.RefDetailPanel,
  })),
);

/* 行き先は文字列リテラルで書く。組み立てるとルートのパスが型から外れ、
   ルートを消したり名前を変えたりしたときに気付けなくなる。 */
const VIEWS = [
  { to: '/projects/$slug/agents', label: 'Agents' },
  { to: '/projects/$slug/git', label: 'Git' },
  { to: '/projects/$slug/beads', label: 'Beads' },
] as const;

function ProjectLayout() {
  const { slug } = Route.useParams();
  return (
    <NavProvider slug={slug}>
      <ProjectChrome slug={slug} />
    </NavProvider>
  );
}

function ProjectChrome({ slug }: { slug: string }) {
  const tree = useQuery(treeQuery);
  const search: ProjectSearch = Route.useSearch();
  const prefs = usePrefs();
  const nav = useNav();
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);
  const panel = openPanelOf(search);

  /* パネルが開いているかは検索パラメータから導く。**開閉の状態を別に持たない** —
     持つと、URL を渡した先でパネルが閉じたまま出る。 */
  useEffect(() => {
    document.body.classList.toggle('drawer-open', panel !== null);
  }, [panel]);

  // 閉じるキーは、どのパネルでも `Escape` にそろえる
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') nav.closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav]);

  /* 幅を掴んで動かす。**閉じている間も幅を保つ** — 閉じる瞬間に既定へ戻すと、
     滑って隠れる途中で幅が跳ねて見える。 */
  const onGripDown = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = drawerRef.current?.offsetWidth ?? 0;
    document.body.classList.add('dragging');
    const move = (moved: MouseEvent) => {
      const width = Math.min(
        window.innerWidth * 0.8,
        Math.max(360, startWidth + (startX - moved.clientX)),
      );
      prefs.set({ drawerWidth: width });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('dragging');
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  if (tree.data !== undefined && project === undefined) {
    return <p className="empty">Project not observed</p>;
  }

  return (
    <>
      <div id="subbar">
        <span id="views">
          {VIEWS.map((view) => (
            <Link
              key={view.to}
              to={view.to}
              params={{ slug }}
              // 画面を移っても、検索語も絞り込みもパネルも持ち越す
              search={(prev: ProjectSearch) => prev}
              className="vbtn"
              activeProps={{ className: 'vbtn current' }}
            >
              {view.label}
            </Link>
          ))}
        </span>
      </div>

      <div id="content">
        <div id="view-pane">
          <Outlet />
        </div>

        {/* 幅は閉じている間も保つ */}
        <div
          id="drawer"
          ref={drawerRef}
          style={
            prefs.drawerWidth === null
              ? undefined
              : { width: prefs.drawerWidth, minWidth: prefs.drawerWidth }
          }
        >
          {/* 幅を掴んで変えるためだけの面。パネルの開け閉てと出し方は横のボタンからできる */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 掴んで動かすためだけの面 */}
          <div id="drawer-grip" title="Drag to resize" onMouseDown={onGripDown} />
          <div id="drawer-controls">
            <button
              type="button"
              title={
                prefs.dock
                  ? 'Switch to overlay panel (floats over the main area)'
                  : 'Switch to side-by-side panel (shrinks the main area)'
              }
              onClick={() => prefs.set({ dock: !prefs.dock })}
            >
              <Icon
                path={prefs.dock ? mdiPictureInPictureBottomRightOutline : mdiDockRight}
                size={14}
              />
            </button>
          </div>
          <div id="drawer-body">
            {/* 閉じている間は描かない。閉じたパネルの中身を持ち続けても誰にも見えない */}
            <div id="conv-pane">
              {panel !== null && (
                <Suspense fallback={<div className="empty">Loading…</div>}>
                  {panel.kind === 'issue' && <IssueDetail id={panel.id} project={project} />}
                  {panel.kind === 'ref' && (
                    <RefDetailPanel rev={panel.rev} label={panel.label} project={project} />
                  )}
                  {panel.kind === 'conv' && <ConvPanel file={panel.file} project={project} />}
                </Suspense>
              )}
            </div>
          </div>
        </div>

        <div id="rail">
          <button
            type="button"
            id="drawer-toggle"
            title="Toggle panel"
            onClick={() => {
              if (panel !== null) {
                nav.closePanel();
                return;
              }
              /* 何も選ばれていないなら、パネルだけを開ける。**対象が無いままでは開いて
                 いられない**ので、`panel` の検索パラメータだけ立てて「選んでください」を出す。 */
              void navigate({
                to: '.',
                search: (prev: ProjectSearch): ProjectSearch => ({
                  ...prev,
                  panel: 'conv',
                }),
              });
            }}
          >
            <Icon path={panel === null ? mdiChevronLeft : mdiChevronRight} size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
