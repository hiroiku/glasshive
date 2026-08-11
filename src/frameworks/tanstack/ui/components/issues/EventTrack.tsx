import type { EventMark, OffAxis, RowTrack } from '../../derive/issueEvents.ts';
import { absTime, cut } from '../../format.ts';

/* 時間軸の上に置く点と、軸の外に落ちたものの件数。**課題の行とマイルストーンの行が同じものを
   使う。** 起きたことをどう読むかは 2 つの表で同じでなければならない —— 点の間隔の決まりも、
   落ちたものの数え方も、片方だけが別の答えを出すと、行き来した人がどちらを信じるか決められない。

   トラック全体の説明はここに置かない。**あちらは何の記録かで言葉が変わる** —— 「この課題は
   記録に居なかった」と「このマイルストーンの課題が記録に居なかった」は別の文である。 */

/** まとまった点に添える種類の並びの長さ。これより長いと `title` が画面からはみ出す */
const MAX_KIND_TEXT = 40;

/** 件数と、その数に合う単数・複数。1 件を `1 events` と言うと、数えていないように読める */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/* トラックの状態を class にする。**4 つの状態がそれぞれ別の絵になる** —— 読んでいる最中と、
   読み終えて何も無かったのと、読めなかったのと、読むものが無かったのは、別の答えである。 */
export function stateClass(track: RowTrack): string {
  if (track.kind === 'reading') return ' reading';
  if (track.kind === 'unread') return ' unread';
  if (track.kind === 'nolog') return ' nolog';
  return '';
}

/* 点の説明。**まとまった点は件数と両端の時刻を言う** —— 形は「2 つ以上が近すぎる」としか
   言えないので、いくつがいつからいつまでなのかは言葉で持つ。 */
export function markTitle(mark: EventMark): string {
  if (mark.count === 1) return `${mark.kinds[0] ?? 'event'} — ${absTime(mark.at)}`;
  return `${mark.count} events between ${absTime(mark.at)} and ${absTime(mark.lastAt)} · ${cut(
    mark.kinds.join(', '),
    MAX_KIND_TEXT,
  )}`;
}

/* 軸の外に落ちたイベントの説明。**件数だけでは、何を見損ねたのか分からない** ——
   いちばん近いものの時刻を添えて、幅を広げれば見えることまで言う。 */
export function offEventTitle(off: OffAxis, side: 'before' | 'beyond'): string {
  const what = `${countOf(off.count, 'event')} ${off.count === 1 ? 'is' : 'are'}`;
  const nearest = side === 'before' ? 'the most recent' : 'the earliest';
  const cutShort =
    off.cut && side === 'before'
      ? ' The event log was also cut short, so what is missing lies out there too.'
      : '';
  return `${what} ${side} this span, ${nearest} on ${absTime(off.at)} — widen the span to see them.${cutShort}`;
}

/* 点と、軸の外の件数。**包む要素を持たない** —— `.gt` の子は絶対配置の `<i>` と `<b>` を
   平らに並べたもので、間に 1 つでも要素を挟むと位置の基準がそこへ移る。

   並べる順がそのまま重なりの順である。呼ぶ側が足すものは、この前後に自分で置く。 */
export function TrackMarks({ track }: { track: RowTrack }) {
  if (track.kind !== 'read') return null;
  return (
    <>
      {track.marks.map((mark) => (
        <i
          key={mark.at}
          className={`gt-ev${mark.count > 1 ? ' many' : ''}`}
          style={{ left: `${mark.pct}%` }}
          title={markTitle(mark)}
        />
      ))}
      {/* 軸の外に落ちたイベント。**黙って落とさない** —— 幅を狭めると点は全部消えるので、
          何も言わないと「何度も動いたもの」と「何も起きていないもの」が同じ絵になる */}
      {track.before !== null && (
        <b
          className={`gt-off left${track.before.cut ? ' cut' : ''}`}
          title={offEventTitle(track.before, 'before')}
        >
          ‹{track.before.count}
        </b>
      )}
      {track.after !== null && (
        <b className="gt-off right" title={offEventTitle(track.after, 'beyond')}>
          {track.after.count}›
        </b>
      )}
    </>
  );
}
