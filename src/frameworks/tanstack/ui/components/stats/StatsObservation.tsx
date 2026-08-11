/* 統計フッターの 4 枚が、その数をどこまで観測できたか。

   **「まだ答えが来ていない」「無かった」「観測できなかった」を 1 つの空のバケットに
   潰さない。** 潰すと、`transcript` を読めなかったプロジェクトが平らな 0 のグラフと
   空の一覧を描いて、本当に静かなプロジェクトと見分けが付かなくなる。

   4 枚が別々に言葉を選ぶと、同じ事実がフッターの中で 3 通りの見え方になる。
   型も文言もここ 1 か所で決める。 */

export type StatsObservation =
  | { readonly kind: 'pending' }
  | { readonly kind: 'observed' }
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'unobservable';
      /** エラーコード。どこで止まったのかが分からないときは `null` */
      readonly reason: string | null;
    };

/* 数を出してよいか。**`absent` は出してよい** —— 観測できたうえで無かったのだから、
   0 はそのプロジェクトについての事実である。 */
export const isObserved = (observation: StatsObservation): boolean =>
  observation.kind === 'observed' || observation.kind === 'absent';

/** 数の代わりに置く文字。読む前は `—`、観測できなかったときは `?` */
export const observationMark = (observation: StatsObservation): string =>
  observation.kind === 'pending' ? '—' : '?';

/* 指したときに出す一言。エラーコードは隠さずに添える —— 案内が当たらなかったときに、
   その語で調べられる。 */
export function observationTitle(observation: StatsObservation): string | undefined {
  if (observation.kind === 'pending') return 'Not read yet';
  if (observation.kind !== 'unobservable') return undefined;
  return observation.reason === null
    ? 'Could not be read'
    : `Could not be read — ${observation.reason}`;
}

/* 数の代わりに置く一言。**空欄にしない** —— 空欄は「0 だった」と読める。

   観測できているときは何も出さない。呼ぶ側で状態を見分けずに置けるようにしてある。 */
export function StatsNote({
  observation,
  className,
}: {
  readonly observation: StatsObservation;
  readonly className?: string;
}) {
  if (isObserved(observation)) return null;
  return (
    <span
      className={className === undefined ? 'sf-note' : `sf-note ${className}`}
      title={observationTitle(observation)}
    >
      {observation.kind === 'pending' ? 'reading…' : 'could not be read'}
    </span>
  );
}
