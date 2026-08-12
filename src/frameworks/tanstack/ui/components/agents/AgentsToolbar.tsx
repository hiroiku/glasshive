import { WINDOWS } from '../../derive/timeWindow.ts';
import type { Axis, Scale } from '../../timeline/axis.ts';
import { SearchInput } from '../primitives/SearchInput.tsx';
import { RangeSlider, TimeInput } from '../timeline/RangeSlider.tsx';

/* 表のツールバー。検索と絞り込みと、いま見ている時間帯。

   **表の列には乗らない。** `#tree-pane` は `role="grid"` で、直の子は `row` か `rowgroup`
   だけである。ここは `#view-pane` の縦並びの中に、表と並べて置く。 */

export interface AgentsToolbarProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /* `transcript` の中身をどこまで読んだか。読み終えていれば null。

     **途中の結果を全部だと思わせない。** 中身の一致は読み進むにつれて足されていくので、
     まだ読んでいる間はどこまで見たかを出す。 */
  readonly deepNote: {
    readonly scanned: number;
    readonly total: number;
    /* 観測できずに止まったか。**止まっても絞り込みは効いたままである。**
       黙って止まると、狭まった表が「その語はどこにも無い」と読める。 */
    readonly unreadable: boolean;
  } | null;
  /** エージェント間メッセージの矢印を、稼働区間のバーの上に重ねるか */
  readonly talk: boolean;
  readonly onTalk: (talk: boolean) => void;
  /* 見えているメッセージの数と、描いた矢印の本数と、描けなかった数。
     **描かなかったものを黙って落とさない。** 表示範囲の外へ出たメッセージも、上限で
     諦めたメッセージも、件数だけはここに出す。矢印は近いものをまとめるので、
     本数はメッセージの数より少ない。 */
  readonly talkNote: {
    /* やりとりを観測できたか。**観測できなかった回を 0 と言わない。**
       0 は「一度も話さなかった」と読める、いちばん強い主張である。 */
    readonly readable: boolean;
    readonly messages: number;
    readonly marks: number;
    readonly dropped: number;
    /* この画面に居ないセッションとのやり取りの数。**`messages` とは別に数える** ——
       片端しか置けていないので、矢の数に混ぜると置いた相手が居るように読める。 */
    readonly peers: number;
    /* 読み取り範囲が `transcript` の先頭まで届いたか。届かなかったぶんの古いメッセージは
       数に入っていない。 */
    readonly complete: boolean;
  } | null;
  /* まだ `transcript` を読んでいる最中か。**押していないときと同じ顔にしない** —— 押した人から
     見て何も変わらない間が在ると、この画面ではやり取りが無かったのだと読める。 */
  readonly talkReading: boolean;
  readonly attention: boolean;
  readonly onAttention: (attention: boolean) => void;
  /* 終わったものも出すか。**この画面の絞り込みであって、設定ではない。**
     隣の `⚠ attention` と同じ `.fchip` で、押されているかは `aria-pressed` が言う。 */
  readonly showAll: boolean;
  readonly onShowAll: (showAll: boolean) => void;
  /** 押したときに増える行の数。増える先が無ければ数を出さない */
  readonly endedHidden: number;
  readonly scale: Scale;
  readonly onScale: (scale: Scale) => void;
  /** 時間帯を手で選んでいるか。選んでいる間はプリセットのチップを光らせない */
  readonly picked: boolean;
  readonly axis: Axis;
  readonly domain: Axis;
  readonly onRange: (t0: number, t1: number) => void;
  readonly onCommitTime: (which: 't0' | 't1') => (atMs: number) => void;
}

export function AgentsToolbar({
  query,
  onQuery,
  deepNote,
  talk,
  onTalk,
  talkNote,
  talkReading,
  attention,
  onAttention,
  showAll,
  onShowAll,
  endedHidden,
  scale,
  onScale,
  picked,
  axis,
  domain,
  onRange,
  onCommitTime,
}: AgentsToolbarProps) {
  /* メッセージのチップに添える説明。**観測できなかったことと、届かなかった古いぶんを、
     どちらも言葉にする。** 数字だけでは、どちらも「そうだった」ようにしか読めない。 */
  const talkTitle = (): string => {
    if (talkReading) {
      return "Reading the open session's transcripts for messages agents sent each other";
    }
    if (talkNote === null) {
      return "Draw arrows for messages agents sent each other (reads the open session's transcripts)";
    }
    if (!talkNote.readable) {
      return 'Messages could not be read — this is not the same as no messages';
    }
    const parts = [`${talkNote.messages} messages in ${talkNote.marks} arrows`];
    if (talkNote.peers > 0) {
      parts.push(
        `${talkNote.peers} with a session that is not in this view — only this end is drawn`,
      );
    }
    if (talkNote.messages === 0 && talkNote.peers === 0) {
      parts.push('none of these agents messaged each other in this window');
    }
    if (talkNote.dropped > 0) {
      parts.push(`${talkNote.dropped} outside the window or over the limit`);
    }
    if (!talkNote.complete) {
      parts.push('messages older than the scan window are not counted');
    }
    return parts.join(', ');
  };

  return (
    <div className="view-toolbar">
      <SearchInput value={query} onChange={onQuery} placeholder="Search agents and transcripts…" />
      {/* 読み終えるまで出し続ける。消えたときが、全部を見終えたときである。
          読みながら結果が増えるので、変わったことをその場で読み上げさせる */}
      {deepNote !== null && (
        <span
          className="deep-note"
          role="status"
          aria-live="polite"
          title={
            deepNote.unreadable
              ? 'Some transcripts could not be read. The rows stay narrowed to the matches found so far, so rows may be missing'
              : 'Reading inside transcripts (last 1 MiB · last 7 days). Matches are added as they are read'
          }
        >
          {deepNote.unreadable
            ? 'transcripts could not be read'
            : deepNote.total === 0
              ? 'reading transcripts…'
              : `${deepNote.scanned} of ${deepNote.total} transcripts read`}
        </span>
      )}
      <button
        type="button"
        className={`fchip ${talk ? 'on' : ''}`}
        aria-pressed={talk}
        title={talkTitle()}
        onClick={() => onTalk(!talk)}
      >
        {/* 読んでいる最中は `…`、読めなかった回は `?`、先頭まで届かなかった回は `≥` を添えて、
            数の意味を変える。**数えるのは矢の中身だけではない** —— 片端しか置けていないやり取りも
            メッセージで、外すと隣のセッションと 21 通交わした画面が `0` と名乗る */}
        {talkReading
          ? '⇄ …'
          : talkNote === null
            ? '⇄ messages'
            : !talkNote.readable
              ? '⇄ ?'
              : `⇄ ${talkNote.complete ? '' : '≥'}${talkNote.messages + talkNote.peers}`}
        {talkNote?.readable === true && talkNote.dropped > 0 && (
          <span className="n">+{talkNote.dropped}</span>
        )}
      </button>
      <button
        type="button"
        className={`fchip ${attention ? 'on' : ''}`}
        aria-pressed={attention}
        title="Show only what needs attention: awaiting your input, or waiting 30 minutes with no activity"
        onClick={() => onAttention(!attention)}
      >
        ⚠ attention
      </button>
      {/* 終わったものを足す。Work の `+ closed` と同じ形にしてある —— 同じ「隠してあるものを
          足す」操作なので、単位が違っても押し方と読み方は変えない */}
      <button
        type="button"
        className={`fchip ${showAll ? 'on' : ''}`}
        aria-pressed={showAll}
        title="Also show sessions that ended more than a day ago, and every subagent that ended"
        onClick={() => onShowAll(!showAll)}
      >
        {endedHidden > 0 ? `+ ended ${endedHidden}` : '+ ended'}
      </button>
      <span className="scale-chips">
        {WINDOWS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`fchip ${!picked && scale === preset.key ? 'on' : ''}`}
            aria-pressed={!picked && scale === preset.key}
            title={preset.title}
            onClick={() => onScale(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </span>
      <RangeSlider min={domain.t0} max={domain.t1} a={axis.t0} b={axis.t1} onChange={onRange} />
      <span className="rs-label">
        <TimeInput value={axis.t0} label="Window start" onCommit={onCommitTime('t0')} />–
        <TimeInput value={axis.t1} label="Window end" onCommit={onCommitTime('t1')} />
      </span>
    </div>
  );
}
