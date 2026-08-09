import { mdiHomeOutline } from '@mdi/js';
import { Link } from '@tanstack/react-router';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import {
  projectDotState,
  visibleSessions,
} from '~/interface/presenters/sessions/visibility.presenter.ts';
import { useCommandMark } from '../../hooks/useCommandMark.ts';
import { useHydrated } from '../../hooks/useHydrated.ts';
import { MAX_SLOTS } from '../../hooks/useTabShortcuts.ts';
import { Dot } from '../primitives/Dot.tsx';
import { Icon } from '../primitives/Icon.tsx';

/* タブ行。留めたものが、留めた順に並ぶ。

   **幅を動かさない。** 件数の札と外す × は同じ場所に置き、載せたときに差し替える。
   × が現れて行が伸びると隣が動き、押すつもりのなかったタブを外してしまう。
   タブは位置で覚えて選ぶものなので、位置が動くこと自体が壊れている。

   鍵盤から選べることは、載せたときの札で言う。**行の見た目は変えない** —
   番号を字として出すと、幅が席ごとに変わって位置が動く。 */

export interface TabBarProps {
  /** タブに出す id。**留めた印そのものではない** — 観測に在るものだけが渡ってくる */
  readonly visible: readonly string[];
  readonly projects: readonly ProjectJson[];
  readonly onUnpin: (id: string) => void;
  /* いま観ているが留めていない巣。末尾に仮の席として出す。
     出さないと、留めていない巣を観ているあいだ、自分がどこに居るかがタブ行から消える。 */
  readonly current: string | null;
  /** 終わったものも数に入れるか。表に出ている数と札の数を揃える */
  readonly showAll: boolean;
}

export function TabBar({ visible, projects, onUnpin, current, showAll }: TabBarProps) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  /* 器はどの道でも同じものでなければならないので、載るまでは道のことを言わない。
     仮の席も「いま居る道」から出るものなので、載ってから足す。 */
  const hydrated = useHydrated();
  const here = hydrated ? current : null;
  const provisional = here !== null && !visible.includes(here) ? here : null;
  /* 数を出すときの今。**行ごとに引かない** — 引き直すと、同じ行の中で
     見える数と見えない数の境目がずれる。 */
  const nowMs = Date.now();
  const mark = useCommandMark();
  // 席の番号は行の並びそのもの。一覧が 1、留めたものが 2 から続く
  const slotMark = (slot: number) => (slot > MAX_SLOTS ? '' : ` (${mark}${slot})`);
  const home = (
    <>
      <Icon path={mdiHomeOutline} size={12} />
      <span>Overview</span>
    </>
  );

  return (
    <nav id="tabs" aria-label="留めた巣">
      {/* 一覧へ戻る席。**留めた印が空でも消えない** — 消えると帰り道が無くなる */}
      <span className="tab">
        {hydrated ? (
          <Link
            to="/"
            className="tab-link"
            activeProps={{ className: 'tab-link on' }}
            activeOptions={{ exact: true }}
            title={`巣の一覧${slotMark(1)}`}
          >
            {home}
          </Link>
        ) : (
          <a className="tab-link" href="/" title={`巣の一覧${slotMark(1)}`}>
            {home}
          </a>
        )}
      </span>

      {visible.map((id, index) => {
        const project = byId.get(id);
        if (project === undefined) return null;
        const shown = visibleSessions(project, showAll, nowMs).length;
        return (
          <span key={id} className="tab">
            <Link
              to="/projects/$slug"
              params={{ slug: id }}
              className="tab-link"
              activeProps={{ className: 'tab-link on' }}
              title={`${project.path ?? id}${slotMark(index + 2)}`}
            >
              <Dot state={projectDotState(project)} />
              <span>{project.name}</span>
            </Link>
            {/* 札と × を同じ枠に重ねる。載せると入れ替わるだけで、枠の幅は変わらない */}
            <span className="tab-slot">
              <span className="n">{shown === 0 ? '' : shown}</span>
              <button
                type="button"
                className="tab-close"
                aria-label={`${project.name} をタブから外す`}
                onClick={() => onUnpin(id)}
              >
                ×
              </button>
            </span>
          </span>
        );
      })}

      {provisional !== null && (
        <span className="tab provisional">
          <Link
            to="/projects/$slug"
            params={{ slug: provisional }}
            className="tab-link on"
            title={byId.get(provisional)?.path ?? provisional}
          >
            {(() => {
              const project = byId.get(provisional);
              return project === undefined ? null : <Dot state={projectDotState(project)} />;
            })()}
            <span>{byId.get(provisional)?.name ?? provisional}</span>
          </Link>
        </span>
      )}
    </nav>
  );
}
