import { useLayoutEffect, useRef, useState } from 'react';
import type { Translator } from '~/interface/i18n/translator.ts';
import { edgeColorOf } from '../../derive/issueTree.ts';
import { depLabel } from '../../derive/labels.ts';
import { cut } from '../../format.ts';
import { hoverTok } from '../../hoverTok.ts';
import { useT } from '../../i18n/useT.ts';
import { useNav } from '../../nav/NavContext.tsx';

/* 1 件の課題と、そこから直接つながっている課題。

   左は「先に済むべきもの」、右は「これが済むのを待っているもの」。**辿るのは 1 つ先まで
   にする** — 2 つ先まで辿ると、一覧全体を小さく描いただけの図になって、どれが自分か
   読めなくなる。

   線は要素の実際の位置から引く。折り返しや幅の変化に付いていくので、
   パネルの幅を変えても線が外れない。 */

const legend = (t: Translator): readonly { key: string; text: string; color: string }[] => [
  { key: 'parent-child', text: t('parent-child'), color: edgeColorOf('parent-child') },
  { key: 'blocks', text: t('blocks'), color: edgeColorOf('blocks') },
  { key: 'other', text: t('other'), color: edgeColorOf('') },
];

export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly status: string | null;
  readonly title: string | null;
}

interface Curve {
  readonly key: string;
  readonly d: string;
  readonly color: string;
  readonly tipX: number;
  readonly tipY: number;
}

export function MiniGraph({
  selfId,
  selfStatus,
  left,
  right,
}: {
  selfId: string;
  selfStatus: string;
  left: readonly GraphNode[];
  right: readonly GraphNode[];
}) {
  const t = useT();
  const nav = useNav();
  const rootRef = useRef<HTMLDivElement>(null);
  const [curves, setCurves] = useState<readonly Curve[]>([]);

  /* 引き直すきっかけは中身の入れ替わりである。読むのは DOM の位置なので、React から見ると
     余計な依存に見えるが、繋がりの数が変わったときに引き直せるのはこれだけである。 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 位置は DOM から読む。数の変化だけが引き直しのきっかけ
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;

    const draw = () => {
      const box = root.getBoundingClientRect();
      const self = root.querySelector('[data-mg="self"]')?.getBoundingClientRect();
      if (self === undefined) return;
      const drawn: Curve[] = [];
      for (const node of root.querySelectorAll<HTMLElement>('[data-mg-side]')) {
        const rect = node.getBoundingClientRect();
        const color = edgeColorOf(node.dataset.mgType ?? '');
        const key = `${node.dataset.mgSide}:${node.dataset.mgId}`;
        const onLeft = node.dataset.mgSide === 'l';
        const x1 = (onLeft ? rect.right : self.right) - box.left;
        const y1 = (onLeft ? rect.top + rect.height / 2 : self.top + self.height / 2) - box.top;
        const x2 = (onLeft ? self.left : rect.left) - box.left - 5;
        const y2 = (onLeft ? self.top + self.height / 2 : rect.top + rect.height / 2) - box.top;
        drawn.push({
          key,
          d: `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`,
          color,
          tipX: x2,
          tipY: y2,
        });
      }
      setCurves(drawn);
    };

    draw();
    // パネルの幅は掴んで変えられる。変わるたびに引き直さないと線が要素から外れる
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    return () => observer.disconnect();
  }, [selfId, left.length, right.length]);

  const node = (item: GraphNode, side: 'l' | 'r') => (
    <button
      type="button"
      key={`${side}:${item.id}:${item.type}`}
      className="mg-node"
      data-mg-side={side}
      data-mg-id={item.id}
      data-mg-type={item.type}
      style={{ borderColor: edgeColorOf(item.type) }}
      title={t('{kind}: {title}', {
        kind: depLabel(t, item.type),
        title: item.title ?? item.id,
      })}
      onClick={() => nav.openIssue(item.id)}
      onMouseEnter={() => hoverTok(item.id, true)}
      onMouseLeave={() => hoverTok(item.id, false)}
      onFocus={() => hoverTok(item.id, true)}
      onBlur={() => hoverTok(item.id, false)}
    >
      {item.status !== null && <span className={`chip st-${item.status}`}>{item.status}</span>}
      <span className="mg-id">{item.id}</span>
      {item.title !== null && <span className="mg-title">{cut(item.title, 26)}</span>}
    </button>
  );

  if (left.length === 0 && right.length === 0) return null;
  return (
    <div className="mini-graph" ref={rootRef}>
      <svg className="mg-svg" role="img">
        <title>{t('This issue and the issues connected to it')}</title>
        {curves.map((curve) => (
          <g key={curve.key}>
            <path d={curve.d} stroke={curve.color} className="mg-edge" />
            <polygon
              points={`${curve.tipX},${curve.tipY - 3} ${curve.tipX + 5},${curve.tipY} ${curve.tipX},${curve.tipY + 3}`}
              fill={curve.color}
            />
          </g>
        ))}
      </svg>
      <div className="mg-col">{left.map((item) => node(item, 'l'))}</div>
      <div className="mg-col mg-center">
        <div className="mg-node self" data-mg="self">
          <span className={`chip st-${selfStatus}`}>{selfStatus}</span>
          <span className="mg-id">{selfId}</span>
        </div>
      </div>
      <div className="mg-col">{right.map((item) => node(item, 'r'))}</div>
      <div className="mg-legend">
        <span className="lg">
          <span className="mg-self-sample" /> {t('this issue')}
        </span>
        {legend(t).map((entry) => (
          <span key={entry.key} className="lg">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1={1}
                y1={4}
                x2={17}
                y2={4}
                stroke={entry.color}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </svg>
            {entry.text}
          </span>
        ))}
      </div>
    </div>
  );
}
