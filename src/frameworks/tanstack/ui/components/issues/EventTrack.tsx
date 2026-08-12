import type { Translator } from '~/interface/i18n/translator.ts';
import type { EventMark, OffAxis, RowTrack } from '../../derive/issueEvents.ts';
import { absTime, cut } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';

/* 時間軸の上に置く点と、軸の外に落ちたものの件数。**課題の行とマイルストーンの行が同じものを
   使う。** 起きたことをどう読むかは 2 つの表で同じでなければならない —— 点の間隔の決まりも、
   落ちたものの数え方も、片方だけが別の答えを出すと、行き来した人がどちらを信じるか決められない。

   トラック全体の説明はここに置かない。**あちらは何の記録かで言葉が変わる** —— 「この課題は
   記録に居なかった」と「このマイルストーンの課題が記録に居なかった」は別の文である。 */

/** まとまった点に添える種類の並びの長さ。これより長いと `title` が画面からはみ出す */
const MAX_KIND_TEXT = 40;

/* 件数と、その数に合う言い方。1 件を `1 events` と言うと、数えていないように読める。

   **数え方は言葉ごとに違う。** 単数と複数の切り分けを自分で書かず、`Intl.PluralRules` を
   持つカタログの側に渡す。名詞は種類で受ける —— 名詞を文字列で受けて組み立てると、
   訳の鍵が取り出せなくなる。 */
export function countOf(t: Translator, count: number, noun: CountNoun): string {
  if (noun === 'issue') return t('{n, plural, one {# issue} other {# issues}}', { n: count });
  if (noun === 'other event') {
    return t('{n, plural, one {# other event} other {# other events}}', { n: count });
  }
  return t('{n, plural, one {# event} other {# events}}', { n: count });
}

/** 数える相手。文字列で受けると、訳の鍵を取り出せなくなる */
export type CountNoun = 'event' | 'issue' | 'other event';

/* トラックの状態を class にする。4 つの答えに対して、絵は 3 つである —— 読んでいる最中は
   点線、読めなかったのはハッチ、記録が無かったのと読み終えて何も無かったのは、どちらも空の
   トラックで、どちらの「無かった」かは `title` が言う。**読めなかったのだけは、空と同じ絵に
   してはいけない。** */
export function stateClass(track: RowTrack): string {
  if (track.kind === 'reading') return ' reading';
  if (track.kind === 'unread') return ' unread';
  if (track.kind === 'nolog') return ' nolog';
  return '';
}

/* 点の説明。**まとまった点は件数と両端の時刻を言う** —— 形は「2 つ以上が近すぎる」としか
   言えないので、いくつがいつからいつまでなのかは言葉で持つ。 */
export function markTitle(t: Translator, mark: EventMark): string {
  if (mark.count === 1) {
    return t('{kind} — {at}', { kind: mark.kinds[0] ?? t('event'), at: absTime(mark.at) });
  }
  return t('{n} events between {from} and {to} · {kinds}', {
    n: mark.count,
    from: absTime(mark.at),
    to: absTime(mark.lastAt),
    kinds: cut(mark.kinds.join(', '), MAX_KIND_TEXT),
  });
}

/* 軸の外に落ちたイベントの説明。**件数だけでは、何を見損ねたのか分からない** ——
   いちばん近いものの時刻を添えて、幅を広げれば見えることまで言う。

   読み残しがこちら側に在るかどうかは `off.cut` が持っている。ここで側を見て判じ直すと、
   同じことを決めるところが 2 つになり、片方だけを直したときに食い違う。 */
export function offEventTitle(t: Translator, off: OffAxis, side: 'before' | 'beyond'): string {
  const cutShort = off.cut
    ? t(' The event log was also cut short, so what is missing lies out there too.')
    : '';
  const body =
    side === 'before'
      ? t('{what} before this span, the most recent on {at} — widen the span to see them.', {
          what: countOf(t, off.count, 'event'),
          at: absTime(off.at),
        })
      : t('{what} beyond this span, the earliest on {at} — widen the span to see them.', {
          what: countOf(t, off.count, 'event'),
          at: absTime(off.at),
        });
  return `${body}${cutShort}`;
}

/* 点と、軸の外の件数。**包む要素を持たない** —— `.gt` の子は絶対配置の `<i>` と `<b>` を
   平らに並べたもので、間に 1 つでも要素を挟むと位置の基準がそこへ移る。

   並べる順がそのまま重なりの順である。呼ぶ側が足すものは、この前後に自分で置く。 */
export function TrackMarks({ track }: { track: RowTrack }) {
  const t = useT();
  if (track.kind !== 'read') return null;
  return (
    <>
      {track.marks.map((mark) => (
        <i
          key={mark.at}
          className={`gt-ev${mark.count > 1 ? ' many' : ''}`}
          style={{ left: `${mark.pct}%` }}
          title={markTitle(t, mark)}
        />
      ))}
      {/* 軸の外に落ちたイベント。**黙って落とさない** —— 幅を狭めると点は全部消えるので、
          何も言わないと「何度も動いたもの」と「何も起きていないもの」が同じ絵になる */}
      {track.before !== null && (
        <b
          className={`gt-off left${track.before.cut ? ' cut' : ''}`}
          title={offEventTitle(t, track.before, 'before')}
        >
          ‹{track.before.count}
        </b>
      )}
      {/* 右端は読み残しを言わない。`readTrack` が `cut` に `false` を渡すのがその決まりで、
          ここで側を見て決め直すと、同じことを決めるところが 2 つになる */}
      {track.after !== null && (
        <b className="gt-off right" title={offEventTitle(t, track.after, 'beyond')}>
          {track.after.count}›
        </b>
      )}
    </>
  );
}
