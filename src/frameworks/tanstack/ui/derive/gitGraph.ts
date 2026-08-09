import type { GitMainNodeJson, GitTipJson } from '~/interface/presenters/git/git.presenter.ts';

/* 記録の枝を、縦に並ぶ行の上へ組み直す。

   本流を 1 本の柱にして、生きている線を左から順の筋に割り当てる。線は自分の行から
   出て、分かれ目の行で柱へ合流する。**畳むのは本流の側だけである** — 生きている線は
   どれも「いま誰かが立っている場所」なので、畳むと画面から人が消える。

   本流のうち、合流でも分かれ目でも先頭でもない記録は 1 行に折る。折らないと、
   数百の記録が生きている線を画面の外へ押し出す。 */

/** 行の高さ。線を描く座標がこれを前提にしている */
export const ROW_HEIGHT = 26;

/** 筋どうしの間 */
export const LANE_GAP = 13;

/** 本流の柱の色。線の色とは別にして、どれが本流かを一目で分ける */
export const MAINLINE_COLOR = '#5b7ea6';

export type GraphRow =
  | { readonly type: 'tip'; readonly tip: GitTipJson; readonly lane: number }
  | { readonly type: 'node'; readonly node: GitMainNodeJson }
  /* 折った塊は、その中の最初の記録で名指す。行の位置で名指すと、上の行が
     1 つ増減しただけで別の塊として組み直される。 */
  | { readonly type: 'fold'; readonly count: number; readonly from: string };

export interface GitLayout {
  readonly rows: readonly GraphRow[];
  /** 本流が始まる行。ここより上は生きている線の行である */
  readonly firstMain: number;
  /** 生きている線の行 → 合流する行 */
  readonly baseIndex: ReadonlyMap<number, number>;
  readonly width: number;
}

/* 本流を畳む。合流・生きている線の分かれ目・先頭は残す。

   分かれ目を残すのは、線がどこへ合流するかを描くのに要るからである。
   畳んだ先が消えると、線が宙で終わる。 */
export function buildRows(
  mainline: readonly GitMainNodeJson[],
  tips: readonly GitTipJson[],
): GraphRow[] {
  const keep = new Set(tips.map((tip) => tip.merge_base));
  const rows: GraphRow[] = tips.map((tip, index) => ({ type: 'tip', tip, lane: index + 1 }));

  let folded = 0;
  let foldedFrom = '';
  mainline.forEach((node, index) => {
    if (node.merge || keep.has(node.sha) || index === 0) {
      if (folded > 0) {
        rows.push({ type: 'fold', count: folded, from: foldedFrom });
        folded = 0;
      }
      rows.push({ type: 'node', node });
      return;
    }
    if (folded === 0) foldedFrom = node.sha;
    folded += 1;
  });
  if (folded > 0) rows.push({ type: 'fold', count: folded, from: foldedFrom });
  return rows;
}

/** 行と筋の割り当て。並べ替えは呼ぶ側が済ませてから渡す */
export function layoutOf(
  mainline: readonly GitMainNodeJson[],
  tips: readonly GitTipJson[],
): GitLayout {
  const rows = buildRows(mainline, tips);
  const baseIndex = new Map<number, number>();
  rows.forEach((row, index) => {
    if (row.type !== 'tip') return;
    const at = rows.findIndex(
      (other) => other.type === 'node' && other.node.sha === row.tip.merge_base,
    );
    /* 分かれ目が本流に見当たらないことがある(遡る数の上限より古い)。
       そのときは最後の行まで線を引く — 途中で切ると、線が宙で終わる。 */
    baseIndex.set(index, at >= 0 ? at : rows.length - 1);
  });
  return { rows, firstMain: tips.length, baseIndex, width: 16 + LANE_GAP * (tips.length + 1) };
}

export type TipSortKey = 'name' | 'ahead' | 'date';

/* 生きている線だけを並べ替える。**本流は並べ替えない** —
   本流の並びは記録そのものの順で、読み替えるものではない。 */
export function sortTips(
  tips: readonly GitTipJson[],
  key: TipSortKey,
  direction: 'asc' | 'desc',
): GitTipJson[] {
  const sign = direction === 'desc' ? -1 : 1;
  return [...tips].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name) * sign;
    if (key === 'ahead') return (a.ahead - b.ahead) * sign;
    return (a.date ?? '').localeCompare(b.date ?? '') * sign;
  });
}
