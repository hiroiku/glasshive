import { WINDOWS } from '../../derive/timeWindow.ts';
import type { Axis, Scale } from '../../timeline/axis.ts';
import { SearchInput } from '../primitives/SearchInput.tsx';
import { RangeSlider, TimeInput } from '../timeline/RangeSlider.tsx';

/* 表のツールバー。検索と絞り込みと、いま見ている時間帯。

   **`#tree-pane` の直の子であり続けること。** 列の定義は `#tree-pane` が持っており、
   ツールバーは `grid-column: 1 / -1` で全列を跨いでいる。ラッパーを 1 枚挟むと跨げなくなる。 */

export interface AgentsToolbarProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /* `transcript` の中身をどこまで読んだか。読み終えていれば null。

     **途中の結果を全部だと思わせない。** 中身の一致は読み進むにつれて足されていくので、
     まだ読んでいる間はどこまで見たかを出す。 */
  readonly deepNote: {
    readonly scanned: number;
    readonly total: number;
  } | null;
  /** エージェント間メッセージの矢印を、稼働区間のバーの上に重ねるか */
  readonly talk: boolean;
  readonly onTalk: (talk: boolean) => void;
  /* 見えているメッセージの数と、描いた矢印の本数と、描けなかった数。
     **描かなかったものを黙って落とさない。** 表示範囲の外へ出たメッセージも、上限で
     諦めたメッセージも、件数だけはここに出す。矢印は近いものをまとめるので、
     本数はメッセージの数より少ない。 */
  readonly talkNote: {
    readonly messages: number;
    readonly marks: number;
    readonly dropped: number;
  } | null;
  readonly attention: boolean;
  readonly onAttention: (attention: boolean) => void;
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
  attention,
  onAttention,
  scale,
  onScale,
  picked,
  axis,
  domain,
  onRange,
  onCommitTime,
}: AgentsToolbarProps) {
  return (
    <div className="view-toolbar">
      <SearchInput value={query} onChange={onQuery} placeholder="Search agents and transcripts…" />
      {/* 読み終えるまで出し続ける。消えたときが、全部を見終えたときである */}
      {deepNote !== null && (
        <span
          className="deep-note"
          title="Reading inside transcripts (last 1 MiB · last 7 days). Matches are added as they are read"
        >
          {deepNote.total === 0
            ? 'reading transcripts…'
            : `${deepNote.scanned} / ${deepNote.total} transcripts`}
        </span>
      )}
      <button
        type="button"
        className={`fchip ${talk ? 'on' : ''}`}
        title={
          talkNote === null
            ? "Draw arrows for messages agents sent each other (reads the open session's transcripts)"
            : `${talkNote.messages} messages in ${talkNote.marks} arrows${talkNote.dropped > 0 ? `, ${talkNote.dropped} outside the window or over the limit` : ''}`
        }
        onClick={() => onTalk(!talk)}
      >
        {talkNote === null ? '⇄ messages' : `⇄ ${talkNote.messages}`}
        {talkNote !== null && talkNote.dropped > 0 && (
          <span className="n">+{talkNote.dropped}</span>
        )}
      </button>
      <button
        type="button"
        className={`fchip ${attention ? 'on' : ''}`}
        title="Show only what needs attention: awaiting your input, or waiting 30 minutes with no activity"
        onClick={() => onAttention(!attention)}
      >
        ⚠ attention
      </button>
      <span className="scale-chips">
        {WINDOWS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`fchip ${!picked && scale === preset.key ? 'on' : ''}`}
            title={preset.title}
            onClick={() => onScale(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </span>
      <RangeSlider min={domain.t0} max={domain.t1} a={axis.t0} b={axis.t1} onChange={onRange} />
      <span className="rs-label">
        <TimeInput value={axis.t0} onCommit={onCommitTime('t0')} />–
        <TimeInput value={axis.t1} onCommit={onCommitTime('t1')} />
      </span>
    </div>
  );
}
