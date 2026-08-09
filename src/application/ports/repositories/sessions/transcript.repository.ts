import type { Observation } from '~/app-kernel/observation.ts';

/* 正本の置き場を読む口。

   **返すのは素材だけである。** 生の字と、大きさ・時刻・どこまで届いたかの数と、
   ここで宣言した素の形しか出さない。読み解きも組み立ても application の service がする。

   どこまで読むかを決めるのも呼ぶ側で、ここは「この正本のここからここまで」と
   言われて開くだけである。

   どれも `Observation` を返す。無いことと読めなかったことは別の事実で、
   errno が見えるのは実装の側だけなので、ここで分けておかないと二度と分けられない。 */

/** 読む相手。在り処と、覚えの鍵になる鮮度を併せ持つ */
export interface TranscriptLocation {
  readonly file: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

/** 歩いて見えた正本 1 つ。中身はまだ読んでいない */
export interface TranscriptSource extends TranscriptLocation {
  /** 正本を指す鍵。置き場での名前から拡張子を落としたもの */
  readonly id: string;
  /* 置き場に在った名前。拡張子込みのまま渡す。
     名前から呼び名や種別を引くのは、言葉を持っている側の仕事である。 */
  readonly fileName: string;
}

/** セッションの正本と、その下の棚に置かれた子の正本 */
export interface SessionSource extends TranscriptSource {
  readonly subagents: readonly TranscriptSource[];
}

/** 名前ひとつぶんの走査結果 */
export interface TranscriptGroup {
  readonly slug: string;
  readonly sessions: readonly SessionSource[];
}

/** 正本の大きさと、最後に書かれた時刻 */
export interface TranscriptStat {
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

/** 読み取った窓 */
export interface TranscriptWindow {
  readonly text: string;
  /* 窓が正本の端まで届いたか。先頭から読んだなら末尾へ、末尾から読んだなら先頭へ。
     `false` なら、その先にまだ字が在る。 */
  readonly complete: boolean;
}

/** どこまで読むか */
export interface WindowRequest {
  readonly maxBytes: number;
  /* 端まで届かなかったときに、そこで切れた行を捨てるか。

     捨てないと、行の途中から始まる(あるいは途中で終わる)字を 1 行として
     読み解こうとして必ず失敗する。逆に、先頭の数行だけが要るときは捨てなくてよい —
     切れた行はどのみち読み解けずに落ちるだけである。 */
  readonly trimPartialLine: boolean;
}

export interface TranscriptRepository {
  /** 木を歩く。名前と stat だけを集め、中身は読まない */
  listTranscripts(): Promise<Observation<readonly TranscriptGroup[]>>;

  /** 正本の大きさと時刻。歩いてから読むまでの間にも正本は伸びる */
  statTranscript(file: string): Promise<Observation<TranscriptStat>>;

  /** 先頭から読む */
  readHead(at: TranscriptLocation, window: WindowRequest): Promise<Observation<TranscriptWindow>>;

  /** 末尾から読む。窓の始まりを決める大きさは、読む直前に採る */
  readTail(at: TranscriptLocation, window: WindowRequest): Promise<Observation<TranscriptWindow>>;

  /* 場所の書き表し方の揺れを均す。

     **解決できなかったときに渡された字を返すのは、この口の仕事ではない。**
     それを `observed` で返すと解決の結果と見分けが付かなくなり、覚える側が
     「解決済み」として抱え込む。字で代えるのは、代えてよいと判断できる呼ぶ側の仕事。 */
  canonicalize(path: string): Promise<Observation<string>>;
}
