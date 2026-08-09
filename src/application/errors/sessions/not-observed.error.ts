import { AppError } from '~/app-kernel/error.ts';

/* 観測していないものを尋ねられた。

   これは観測の失敗ではなく、**求めを断る**理由である。だから `Observation` ではなく
   `Result` で運ぶ。観る人には「そんな巣は知らない」と答えるほかない。 */

export class ProjectNotObservedError extends AppError {
  readonly code = 'project.not_observed';
}

export class SessionNotObservedError extends AppError {
  readonly code = 'session.not_observed';
}
