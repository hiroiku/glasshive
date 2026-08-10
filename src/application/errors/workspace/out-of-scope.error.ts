import { AppError } from '~/app-kernel/error.ts';

/* 観測していない `transcript` を開こうとした。

   これは観測の失敗ではなく、**呼び出しを断る**理由である。だから `Observation` ではなく
   `Result` で運ぶ。

   在るか無いかは答えない。断り方を分けると、尋ねて回るだけで
   `~/.claude/projects` に何が在るかが分かってしまう。 */

export class TranscriptOutOfScopeError extends AppError {
  readonly code = 'transcript.out_of_scope';
}
