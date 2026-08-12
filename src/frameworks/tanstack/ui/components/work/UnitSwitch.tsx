import {
  mdiFlagOutline,
  mdiSitemapOutline,
  mdiSourceBranch,
  mdiViewSequentialOutline,
} from '@mdi/js';
import type { WorkUnit } from '../../nav/search.ts';
import { Icon } from '../primitives/Icon.tsx';

/* Work の画面で「1 行が何を指すか」を選ぶ。**タブの階層をここへ畳んである。**

   課題とブランチとマイルストーンは同じ作業を別の側から見たもので、PR が課題とブランチを、
   課題がマイルストーンとブランチを繋いでいる。別々のタブに置くと、繋ぎ目を人が頭の中で
   持つことになる。件数を添えてあるのは、切り替える前に向こう側に何件あるかを
   読めるようにするためである。 */

/* 向こう側の件数。**数えられなかったことを 0 で表さない** —— 0 は「1 件も無い」という
   断定で、読みに行けていないときにそれを出すと、切り替える必要が無いように読める。 */
export type UnitCount = number | 'pending' | 'unobservable';

export interface UnitSwitchProps {
  readonly unit: WorkUnit | null;
  readonly onUnit: (unit: WorkUnit | null) => void;
  readonly issueCount: UnitCount;
  readonly branchCount: UnitCount;
  readonly milestoneCount: UnitCount;
}

/* 数えられていない件数の出し方。まだ来ていないなら `—`、読めなかったなら `?` にする ——
   Overview の表が既にこの 2 つを使い分けているので、同じ意味に同じ絵を当てる。 */
function Count({ count, unit }: { count: UnitCount; unit: string }) {
  if (typeof count === 'number') return <span className="n">{count}</span>;
  return (
    <span
      className={`n ${count === 'pending' ? 'counting' : 'unread'}`}
      title={
        count === 'pending'
          ? `Still counting the ${unit}`
          : `The ${unit} could not be read — this is not zero`
      }
    >
      {count === 'pending' ? '—' : '?'}
    </span>
  );
}

export function UnitSwitch({
  unit,
  onUnit,
  issueCount,
  branchCount,
  milestoneCount,
}: UnitSwitchProps) {
  return (
    <span className="unit-switch">
      <button
        type="button"
        className={`ubtn${unit === null ? ' on' : ''}`}
        aria-pressed={unit === null}
        onClick={() => onUnit(null)}
      >
        <Icon path={mdiSitemapOutline} size={11} />
        Issues
        <Count count={issueCount} unit="issues" />
      </button>
      <button
        type="button"
        className={`ubtn${unit === 'branches' ? ' on' : ''}`}
        aria-pressed={unit === 'branches'}
        onClick={() => onUnit('branches')}
      >
        <Icon path={mdiSourceBranch} size={11} />
        Branches
        <Count count={branchCount} unit="branches" />
      </button>
      <button
        type="button"
        className={`ubtn${unit === 'milestones' ? ' on' : ''}`}
        aria-pressed={unit === 'milestones'}
        onClick={() => onUnit('milestones')}
      >
        <Icon path={mdiFlagOutline} size={11} />
        Milestones
        <Count count={milestoneCount} unit="milestones" />
      </button>
    </span>
  );
}

/* 課題の並べ方。一覧か、依存グラフか。

   **絵だけでは何に切り替わるのか読めない。** 隣の `UnitSwitch` と同じく、絵に言葉を添える。
   絵は覚えた人が速く押すためのもので、初めての人が読むのは言葉のほうである。

   **着手順はここに出さない。** 一覧の `Start` 列の並べ替えがそのまま着手順で、
   同じことを 2 か所から選べるようにすると、どちらが効いているのか読めなくなる。 */
export function LayoutSwitch({
  graph,
  onGraph,
}: {
  readonly graph: boolean;
  readonly onGraph: (graph: boolean) => void;
}) {
  return (
    <span className="layout-switch">
      <button
        type="button"
        className={`lbtn${graph ? '' : ' on'}`}
        aria-pressed={!graph}
        title="List — rows, with dependency arcs in the gutter"
        onClick={() => onGraph(false)}
      >
        <Icon path={mdiViewSequentialOutline} size={13} />
        List
      </button>
      <button
        type="button"
        className={`lbtn${graph ? ' on' : ''}`}
        aria-pressed={graph}
        title="Graph — laid out left to right in start order"
        onClick={() => onGraph(true)}
      >
        <Icon path={mdiSitemapOutline} size={13} />
        Graph
      </button>
    </span>
  );
}
