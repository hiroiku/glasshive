import { AppError } from '~/app-kernel/error.ts';

/* 観測していないものを尋ねられた。

   これは観測の失敗ではなく、**呼び出しを断る**理由である。だから `Observation` ではなく
   `Result` で運ぶ。ユーザーには「そのプロジェクトは知らない」と答えるほかない。 */

export class ProjectNotObservedError extends AppError {
  readonly code = 'project.not_observed';
}

export class SessionNotObservedError extends AppError {
  readonly code = 'session.not_observed';
}
