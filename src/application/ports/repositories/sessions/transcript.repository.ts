import type { Observation } from '~/app-kernel/observation.ts';

/* `transcript` のルート(`~/.claude/projects`)を読むポート。

   **返すのは素材だけである。** 生のテキストと、大きさ・時刻・どこまで届いたかの数と、
   ここで宣言した素の形しか出さない。パースも組み立ても application の service がする。

   どこまで読むかを決めるのも呼ぶ側で、ここは「この `transcript` のここからここまで」と
   言われて開くだけである。

   どれも `Observation` を返す。無かったことと観測できなかったことは別の事実で、
   errno が見えるのは実装の側だけなので、ここで分けておかないと二度と分けられない。 */

/** 読む相手。パスと、キャッシュのキーになる鮮度を併せ持つ */
export interface TranscriptLocation {
  readonly file: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

/** 走査して見えた `transcript` 1 つ。中身はまだ読んでいない */
export interface TranscriptSource extends TranscriptLocation {
  /** `transcript` を指すキー。ファイル名から拡張子を落としたもの */
  readonly id: string;
  /* ディレクトリに在ったファイル名。拡張子込みのまま渡す。
     名前からラベルや種別を引くのは、言葉を持っている側の仕事である。 */
  readonly fileName: string;
}

/* `transcript` の隣に置かれた `*.meta.json`。Claude Code が
   `<transcript のファイル名>.meta.json` として書く。

   **親子はディレクトリの並びからは分からない。** 子はどれだけ深く産まれても同じ
   ディレクトリに平らに並ぶので、誰が誰を呼んだかはこの `*.meta.json` にしか
   書かれていない。読まなければ木は 2 階層に潰れる。 */
export interface AgentMeta {
  /** 呼ばれ方(general-purpose / Explore / workflow-subagent など) */
  readonly agentType: string | null;
  /* 宛先に使う名前。**同一性ではない。** 子どうしが互いを呼ぶとき、指紋の付いた
     キーではなくこの文字列を使う。名前を持たない子も居る。 */
  readonly name: string | null;
  /** どの `tool_use` から生まれたか。`*.meta.json` の外では、子はこの文字列で指されることがある */
  readonly toolUseId: string | null;
  /** 呼んだ側が添えた一行。人が読める唯一の手がかりで、無ければ 16 進の id しか残らない */
  readonly description: string | null;
  /** 呼んだ相手。根の子には無い */
  readonly parentAgentId: string | null;
}

/** 子(サブエージェント)の `transcript` 1 つ。隣の `*.meta.json` を読めていれば併せて持つ */
export interface SubagentSource extends TranscriptSource {
  readonly meta: AgentMeta | null;
  /* どの実行のディレクトリに置かれていたか。1 回の実行の中で産まれた子は `*.meta.json` に
     呼んだ相手を持たないので、同じ実行の仲間だと言えるのはディレクトリ名だけである。
     そのディレクトリの外で産まれた子は持たない。 */
  readonly runId: string | null;
}

/** セッションの `transcript` と、その下のディレクトリに置かれた子の `transcript` */
export interface SessionSource extends TranscriptSource {
  readonly subagents: readonly SubagentSource[];
  /* 子のディレクトリを走査できたか。走査できたなら、そこに見えた子の `transcript` の数。

     ディレクトリがそもそも無ければ「無かった」になる — 子を呼んでいないセッションはこうなる。
     **読めなかったことを空の一覧に潰さない。** 潰すと、子を呼ばなかったセッションと、
     子を数えられなかったセッションが同じ形になる。 */
  readonly subagentsWalked: Observation<number>;
}

/** 名前ひとつぶんの走査結果 */
export interface TranscriptGroup {
  readonly slug: string;
  readonly sessions: readonly SessionSource[];
  /* このディレクトリを走査できたか。走査できたなら、そこに見えた `transcript` の数。

     `sessions` の長さとは限らない。stat を採れなかった `transcript` は載せようがないので、
     見えた数のほうが多くなることがある。

     **読めなかったことを空の一覧に潰さない。** 潰すと、セッションを 1 つも持たない
     ディレクトリと同じ形になり、プロジェクトが一覧から黙って消える。 */
  readonly walked: Observation<number>;
}

/** `transcript` の大きさと、最後に書かれた時刻 */
export interface TranscriptStat {
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

/** 読み取った範囲 */
export interface TranscriptWindow {
  readonly text: string;
  /* 読み取り範囲が `transcript` の端まで届いたか。先頭から読んだなら末尾へ、
     末尾から読んだなら先頭へ。`false` なら、その先にまだテキストが在る。 */
  readonly complete: boolean;
}

/** どこまで読むか */
export interface WindowRequest {
  readonly maxBytes: number;
  /* 端まで届かなかったときに、そこで切れた行を捨てるか。

     捨てないと、行の途中から始まる(あるいは途中で終わる)テキストを 1 行として
     パースしようとして必ず失敗する。逆に、先頭の数行だけが要るときは捨てなくてよい —
     切れた行はどのみちパースできずに落ちるだけである。 */
  readonly trimPartialLine: boolean;
}

export interface TranscriptRepository {
  /** ディレクトリツリーを走査する。名前と stat だけを集め、中身は読まない */
  listTranscripts(): Promise<Observation<readonly TranscriptGroup[]>>;

  /** `transcript` の大きさと時刻。走査してから読むまでの間にも `transcript` は伸びる */
  statTranscript(file: string): Promise<Observation<TranscriptStat>>;

  /** 先頭から読む */
  readHead(at: TranscriptLocation, window: WindowRequest): Promise<Observation<TranscriptWindow>>;

  /** 末尾から読む。読み取り範囲の先頭を決める大きさは、読む直前に採る */
  readTail(at: TranscriptLocation, window: WindowRequest): Promise<Observation<TranscriptWindow>>;

  /* パスの書き表し方の揺れを正規化する。

     **解決できなかったときに、渡された文字列をそのまま返すのはこのポートの仕事ではない。**
     それを `observed` で返すと解決の結果と見分けが付かなくなり、覚える側が
     「解決済み」として抱え込む。渡された文字列で代えるのは、代えてよいと判断できる
     呼ぶ側の仕事である。 */
  canonicalize(path: string): Promise<Observation<string>>;
}
