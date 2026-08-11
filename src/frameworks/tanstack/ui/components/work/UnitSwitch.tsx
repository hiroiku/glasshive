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

export interface UnitSwitchProps {
  readonly unit: WorkUnit | null;
  readonly onUnit: (unit: WorkUnit | null) => void;
  readonly issueCount: number;
  readonly branchCount: number;
  readonly milestoneCount: number;
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
        <span className="n">{issueCount}</span>
      </button>
      <button
        type="button"
        className={`ubtn${unit === 'branches' ? ' on' : ''}`}
        aria-pressed={unit === 'branches'}
        onClick={() => onUnit('branches')}
      >
        <Icon path={mdiSourceBranch} size={11} />
        Branches
        <span className="n">{branchCount}</span>
      </button>
      <button
        type="button"
        className={`ubtn${unit === 'milestones' ? ' on' : ''}`}
        aria-pressed={unit === 'milestones'}
        onClick={() => onUnit('milestones')}
      >
        <Icon path={mdiFlagOutline} size={11} />
        Milestones
        <span className="n">{milestoneCount}</span>
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
