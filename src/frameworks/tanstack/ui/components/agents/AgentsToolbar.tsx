import type { Axis, Scale } from '../../timeline/axis.ts';
import { SCALES } from '../../timeline/axis.ts';
import { RangeSlider, TimeInput } from '../timeline/RangeSlider.tsx';

/* 表のツールバー。検索と絞り込みと、いま見ている時間帯。

   **`#tree-pane` の直の子であり続けること。** 列の定義は `#tree-pane` が持っており、
   ツールバーは `grid-column: 1 / -1` で全列を跨いでいる。ラッパーを 1 枚挟むと跨げなくなる。 */

export interface AgentsToolbarProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** 見えている欄ではなく、`transcript` の中身を検索するか */
  readonly deep: boolean;
  readonly onDeep: (deep: boolean) => void;
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
  deep,
  onDeep,
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
      <input
        className="search"
        type="search"
        placeholder={deep ? 'Search transcripts (deep)…' : 'Search agents…'}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <button
        type="button"
        className={`fchip ${deep ? 'on' : ''}`}
        title="Search inside transcripts (last 1 MiB · last 7 days)"
        onClick={() => onDeep(!deep)}
      >
        deep
      </button>
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
        {SCALES.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`fchip ${!picked && scale === preset.key ? 'on' : ''}`}
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
