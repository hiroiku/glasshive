import { mdiCommentOutline, mdiSourceBranch } from '@mdi/js';
import { useMemo, useState } from 'react';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import {
  buildDependencyGraph,
  type GraphNode,
  layoutGraph,
  type PlacedNode,
} from '../../derive/dependencyGraph.ts';
import { ARROW } from '../../derive/edgeShape.ts';
import { labelColors, leadPullRequest, subProgress } from '../../derive/githubIssue.ts';
import {
  liveCount,
  type MatchedWorker,
  viaLabel,
  type WorkerIndex,
  workersOn,
} from '../../derive/workers.ts';
import { branchStateOf, type WorkJoin } from '../../derive/workJoin.ts';
import { cut } from '../../format.ts';
import { pressable } from '../../pressable.ts';
import { AvatarStack } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { EdgeSample } from './Legend.tsx';

/* 依存を、着手順そのものとして描く。

   **横に並ぶ位置が意味を持つ。** 左端の列は「いま手を付けられて、何かを堰き止めているもの」で、
   その右は「左が 1 つ片付けば空くもの」である。輪に囚われたものは `layer` に置かず、
   下の `band` へ落とす —— `layer` に置けば「n つ先」に見えるが、輪の中はどの `layer` にも居ない。
   辺を 1 本も持たない課題は絵から外し、下の `band` にチップとして並べる。

   ノードに触れると、それを終わらせたとき何が空くかが伝わる。ここがこの画面の値打ちで、
   一覧では「この 1 件が 4 件を堰き止めている」が読めない。 */

/** 一度に並べるラベルの数。カードは 2 行しか無いので 1 つだけ */
const MAX_LABELS = 1;

/** 一度に並べる顔の数 */
const MAX_FACES = 2;

/* 凡例に並べる状態の順。**この絵に出ている状態しか凡例に出さない** —
   出ていない色を並べると、読む人はそれを探して見つからないことになる。
   ここに無い状態は末尾へ回る(GitHub は好きな状態名を持てる)。 */
const STATUS_ORDER = ['open', 'blocked', 'closed'];

export interface DependencyGraphProps {
  /** 描く課題。**閉じたものを混ぜない** — 片付いた相手が堰き止め続けることになる */
  readonly issues: readonly IssueSummaryJson[];
  readonly workers: WorkerIndex;
  readonly onOpen: (id: string) => void;
  /** 課題とブランチの突き合わせ。無ければブランチのアイコンが出ないだけ */
  readonly join?: WorkJoin | undefined;
}

export function DependencyGraph({ issues, workers, onOpen, join }: DependencyGraphProps) {
  const graph = useMemo(() => buildDependencyGraph(issues), [issues]);
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const [hot, setHot] = useState<string | null>(null);

  /* 触れているノードから、推移的に空く先。**辺ではなく到達できる集合で持つ** —
     どの辺を光らせるかは、両端がこの集合に居るかで決まる。 */
  const downstream = useMemo(() => {
    if (hot === null) return null;
    const blocking = new Map(graph.nodes.map((node) => [node.issue.id ?? '', node.blocking]));
    const seen = new Set<string>();
    const rest = [...(blocking.get(hot) ?? [])];
    while (rest.length > 0) {
      const id = rest.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      rest.push(...(blocking.get(id) ?? []));
    }
    seen.delete(hot);
    return seen;
  }, [graph, hot]);

  const byId = new Map(graph.nodes.map((node) => [node.issue.id ?? '', node]));
  const loose = graph.loose.flatMap((id) => {
    const node = byId.get(id);
    return node === undefined ? [] : [node];
  });

  if (layout.nodes.length === 0 && loose.length === 0) {
    return <div className="empty">No open issues to place</div>;
  }

  const caughtCount = graph.caught.length;
  const states = [...new Set(layout.nodes.map((placed) => placed.node.issue.status))].sort(
    (a, b) =>
      (STATUS_ORDER.indexOf(a) + 1 || STATUS_ORDER.length + 1) -
      (STATUS_ORDER.indexOf(b) + 1 || STATUS_ORDER.length + 1),
  );

  return (
    <div className="dep-graph">
      <div className="dg-bar">
        <span className="dg-title">Dependency graph</span>
        <span className="dg-readout">{readoutOf(hot, downstream, graph)}</span>
      </div>

      {/* 縦に流すのはここ 1 か所だけ。**絵とチップで分け合わない** —— 分けると絵が浅いときに
          余りを絵が抱え込み、チップだけが窮屈になる。続けて流せば、絵はその高さぶんで済む。 */}
      <div className="dg-body">
        {layout.nodes.length === 0 ? (
          <div className="empty">No issue blocks another one</div>
        ) : (
          <div className="dg-scroll">
            <div
              className={`dg-canvas${hot === null ? '' : ' hot'}`}
              style={{ width: layout.width, height: layout.height }}
            >
              {/* 辺はレイアウトの外に置く。カードは絶対座標なので、重ねても位置は動かない */}
              <svg
                className="dg-edges"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                aria-hidden="true"
              >
                <defs>
                  {/* 矢じりの大きさは一覧と同じにする。線の太さでは伸び縮みさせない —
                  太さは「光っているか」で変わるので、太さに乗せると矢だけが跳ねる */}
                  <marker
                    id="dg-arrow"
                    viewBox={`0 0 ${ARROW.length} ${ARROW.half * 2}`}
                    refX={ARROW.length}
                    refY={ARROW.half}
                    markerWidth={ARROW.length}
                    markerHeight={ARROW.half * 2}
                    markerUnits="userSpaceOnUse"
                    orient="auto"
                  >
                    <path
                      d={`M0 0 L${ARROW.length} ${ARROW.half} L0 ${ARROW.half * 2} z`}
                      fill="currentColor"
                    />
                  </marker>
                </defs>

                {layout.band !== null && (
                  <>
                    <rect
                      className="dg-pen"
                      x={-13}
                      y={layout.band.y - 15}
                      width={layout.band.width}
                      height={layout.band.height}
                      rx={11}
                    />
                    <text className="dg-pen-label" x={-11} y={layout.band.y - 23}>
                      {`Caught in a cycle — ${caughtCount} cannot start`}
                    </text>
                  </>
                )}

                {/* `layer` の見出しと、その `layer` がどこまで続くかの線。**線が要る** ——
                行数の多い `layer` は横へ折り返すので、線が無いと隣の `layer` と見分けが付かない */}
                {layout.columns.map((column) => (
                  <g key={column.layer}>
                    <text
                      className={`dg-col${column.layer === 0 ? ' ready' : ''}`}
                      x={column.x}
                      y={-12}
                    >
                      {column.layer === 0 ? 'Ready now' : `${column.layer} away`}
                    </text>
                    <line
                      className={`dg-col-rule${column.layer === 0 ? ' ready' : ''}`}
                      x1={column.x}
                      y1={-6}
                      x2={column.x + column.width}
                      y2={-6}
                    />
                  </g>
                ))}

                {layout.edges.map((edge) => (
                  <path
                    key={`${edge.from}->${edge.to}`}
                    className={`dg-edge${edge.cyclic ? ' cyc' : ''}${
                      downstream !== null &&
                      (edge.from === hot || downstream.has(edge.from)) &&
                      downstream.has(edge.to)
                        ? ' lit'
                        : ''
                    }`}
                    d={edge.path}
                    markerEnd="url(#dg-arrow)"
                  />
                ))}
              </svg>

              {layout.nodes.map((placed) => (
                <Card
                  key={placed.node.issue.id}
                  placed={placed}
                  workers={workers}
                  hot={hot}
                  downstream={downstream}
                  join={join}
                  onEnter={() => setHot(placed.node.issue.id)}
                  onLeave={() => setHot(null)}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        )}

        {/* 辺を持たない課題。**絵の中に混ぜない** —— 依存の絵に置くものが何も無いのに
            `layer` のグリッドを占めて、依存を持つ数件を陰に追いやる。絶対座標を持たないので、
            表示範囲の幅に合わせて自分で畳む。 */}
        {loose.length > 0 && (
          <div className={`dg-loose${hot === null ? '' : ' hot'}`}>
            <div className="dg-loose-head">
              {`No dependencies — ${loose.length} ${loose.length === 1 ? 'issue' : 'issues'} you can start any time`}
            </div>
            <div className="dg-loose-list">
              {loose.map((node) => (
                <LooseCard
                  key={node.issue.id}
                  node={node}
                  workers={workers}
                  join={join}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* カードに出るものは、全部ここに書く。**説明を書かないアイコンやチップを出さない** —
          読めないアイコンは、読む人にとって在っても無くても同じである */}
      <div className="legend-bar">
        <span>
          <EdgeSample color="var(--ended)" /> blocks — follow the arrows to get the start order
        </span>
        <span>
          <EdgeSample color="#fb7185" dashed /> blocks inside a cycle
        </span>
        {/* 左端のバーと枠線は状態を表す。ラベルの色は下のチップが持っている */}
        {states.map((status) => (
          <span key={status}>
            <i className={`rail st-${status}`} /> {status.replace('_', ' ')}
          </span>
        ))}
        <span>
          <i className="dot" style={{ background: 'var(--active)' }} /> agent working
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--waiting)' }} /> waiting for you
        </span>
        <span>
          <b className="dg-unlock">+n</b> finishing it frees n issues
        </span>
        {/* 親子はここにしか出ない。**辺にはならない** — 階層であって、待ちではない */}
        <span>
          <b className="dg-parent">↳#n</b> it is a sub-issue of #n
        </span>
        <span>
          <b className="dg-sub">n/m</b> n of its m sub-issues are closed
        </span>
        <span>
          <b className="dg-cmt">
            <Icon path={mdiCommentOutline} size={9} />n
          </b>{' '}
          it has n comments
        </span>
        <span>
          <b className="dg-br">
            <Icon path={mdiSourceBranch} size={9} />
            ↓n
          </b>{' '}
          its branch is n commits behind the base
        </span>
        <span>
          <b className="dg-br warn">
            <Icon path={mdiSourceBranch} size={9} />⚠
          </b>{' '}
          its branch touches the same files as another
        </span>
        <span>
          <b className="prchip open">#n</b> the pull request that closes it
        </span>
        {!graph.complete && (
          <span className="dg-cut" title="Some blocking issues were not fetched">
            some dependencies were not fetched — edges may be missing
          </span>
        )}
      </div>
    </div>
  );
}

/* 読み上げ。**「輪の中にある」を「何も空かない」と同じ言い方にしない** —
   前者は依存を 1 本外せば動く話で、後者は本当に下流が無い話である。 */
function readoutOf(
  hot: string | null,
  downstream: ReadonlySet<string> | null,
  graph: ReturnType<typeof buildDependencyGraph>,
): string {
  if (hot === null || downstream === null) return 'Hover an issue to see what finishing it frees';
  if (graph.caught.includes(hot)) {
    return `${hot} is caught in a cycle — nothing frees up until the cycle is broken`;
  }
  if (downstream.size === 0) return `Finishing ${hot} frees nothing`;
  return `Finishing ${hot} frees ${downstream.size} ${downstream.size === 1 ? 'issue' : 'issues'}`;
}

interface CardProps {
  readonly placed: PlacedNode;
  readonly workers: WorkerIndex;
  readonly hot: string | null;
  readonly downstream: ReadonlySet<string> | null;
  readonly join?: WorkJoin | undefined;
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onOpen: (id: string) => void;
}

function Card({ placed, workers, hot, downstream, join, onEnter, onLeave, onOpen }: CardProps) {
  const node: GraphNode = placed.node;
  const id = node.issue.id ?? '';

  const self = hot === id;
  const lit = self || downstream?.has(id) === true;

  return (
    // biome-ignore lint/a11y/useSemanticElements: 中にチップを持つカードは button にできない
    <div
      className={`dg-node st-${node.issue.status}${placed.caught ? ' caught' : ''}${lit ? ' lit' : ''}${self ? ' self' : ''}`}
      style={{ left: placed.x, top: placed.y }}
      role="button"
      tabIndex={0}
      aria-label={`Open issue ${id}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      {...pressable(() => onOpen(id))}
    >
      <CardFace node={node} workers={workers} join={join} />
    </div>
  );
}

interface LooseCardProps {
  readonly node: GraphNode;
  readonly workers: WorkerIndex;
  readonly join?: WorkJoin | undefined;
  readonly onOpen: (id: string) => void;
}

/* 辺を持たない課題の 1 枚。**絵の中のカードと同じ中身を出す。** 堰き止める先が無いだけで、
   ラベルも担当もコメントも親子も持っている。ここを id と題名だけにすると、開いてみるまで
   何ひとつ分からない。置き場所だけが違う —— あちらは絶対座標、こちらはグリッドのセルである。

   触れても何も光らせない。空ける先が無いのだから、絵を薄くして見せるものが無い。 */
function LooseCard({ node, workers, join, onOpen }: LooseCardProps) {
  const id = node.issue.id ?? '';

  return (
    // biome-ignore lint/a11y/useSemanticElements: 中にチップを持つカードは button にできない
    <div
      className={`dg-node loose st-${node.issue.status}`}
      role="button"
      tabIndex={0}
      aria-label={`Open issue ${id}`}
      {...pressable(() => onOpen(id))}
    >
      <CardFace node={node} workers={workers} join={join} />
    </div>
  );
}

interface CardFaceProps {
  readonly node: GraphNode;
  readonly workers: WorkerIndex;
  readonly join?: WorkJoin | undefined;
}

/* カード 1 枚の中身。**絵の中と、辺を持たない課題の `band` とで、同じものを出す。**
   同じものが 2 か所で別の顔をしていると、読む人はどちらが全部なのかを確かめに行くことになる。

   2 行しか無いので、載せるものは選んである。1 行目は名前と、終わらせると何件空くか。
   2 行目はこの課題の今 —— ラベル、担当、動いているエージェント、親子、コメント、PR。 */
function CardFace({ node, workers, join }: CardFaceProps) {
  const issue = node.issue;
  const colors = labelColors(issue);
  const labels = issue.labels ?? [];
  const pull = leadPullRequest(issue);
  const beat = leadWorker(workersOn(workers, issue));
  const branch = join === undefined ? null : branchStateOf(issue, join.tips, join.conflicts);

  const progress = subProgress(issue, undefined);
  /* 親。堰き止めではないので `layer` には出ないが、この課題がどこに属するかは言う */
  const parent = issue.deps.find((dependency) => dependency.type === 'parent-child')?.on ?? null;
  const comments = issue.github?.comments ?? 0;

  return (
    <>
      <div className="dg-top">
        <span className="dg-id">{issue.id ?? ''}</span>
        <span className="dg-title-t" title={issue.title ?? ''}>
          {cut(issue.title ?? '', 34)}
        </span>
        {node.unlocks > 0 && (
          <span className="dg-unlock" title={`Finishing this frees ${node.unlocks}`}>
            +{node.unlocks}
          </span>
        )}
      </div>

      <div className="dg-bot">
        {labels.slice(0, MAX_LABELS).map((label) => {
          const color = colors.get(label);
          return (
            <span
              key={label}
              className={`lbl${color === undefined ? '' : ' tinted'}`}
              style={color === undefined ? undefined : { ['--lc' as string]: `#${color}` }}
            >
              {cut(label, 12)}
            </span>
          );
        })}
        {issue.github !== null && issue.github.assignees.length > 0 && (
          <AvatarStack actors={issue.github.assignees} max={MAX_FACES} />
        )}
        {beat !== null && (
          <span
            className={`dg-beat ${beat.state}${beat.via === 'branch' ? ' via' : ''}`}
            title={[`${beat.label} — ${beat.state}`, viaLabel(beat)].filter(Boolean).join(' · ')}
          >
            <i />
            {cut(beat.label, 14)}
          </span>
        )}
        <span className="dg-grow" />
        {parent !== null && (
          <span className="dg-parent" title={`Sub-issue of ${parent}`}>
            ↳{parent}
          </span>
        )}
        {progress !== null && progress.total > 0 && (
          <span
            className="dg-sub"
            title={`${progress.closed} of ${progress.total} sub-issues closed`}
          >
            {progress.closed}/{progress.total}
          </span>
        )}
        {comments > 0 && (
          <span className="dg-cmt" title={`${comments} comments`}>
            <Icon path={mdiCommentOutline} size={9} />
            {comments}
          </span>
        )}
        {/* PR のブランチが手元でどうなっているか。**この 1 つだけを持ち込む** —
            カードは 2 行しか無いので、遅れと衝突だけに絞る */}
        {branch !== null && (branch.behind > 0 || branch.conflictsWith.length > 0) && (
          <span
            className={`dg-br${branch.conflictsWith.length > 0 ? ' warn' : ''}`}
            title={`${branch.name} — ${branch.ahead} ahead, ${branch.behind} behind${
              branch.conflictsWith.length === 0
                ? ''
                : ` · touches the same files as ${branch.conflictsWith.join(', ')}`
            }`}
          >
            <Icon path={mdiSourceBranch} size={9} />
            {branch.behind > 0 ? `↓${branch.behind}` : '⚠'}
          </span>
        )}
        {pull !== null && (
          <span
            className={`prchip ${pull.is_draft ? 'draft' : pull.state.toLowerCase()}`}
            title={`Pull request #${pull.number}`}
          >
            #{pull.number}
          </span>
        )}
      </div>
    </>
  );
}

/* 出すエージェントは 1 人だけ。**動いているものを先に採る** ——
   カードに並べたいのは「いま誰が削っているか」で、終わった記録ではない。 */
function leadWorker(found: readonly MatchedWorker[]): MatchedWorker | null {
  if (liveCount(found) === 0) return null;
  return (
    found.find((worker) => worker.state === 'active') ??
    found.find((worker) => worker.state !== 'ended') ??
    null
  );
}
