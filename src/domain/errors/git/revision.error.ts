import { AppError } from '~/app-kernel/error.ts';

/** `git` へ渡せない形のリビジョンが呼び出しに載っていた。観測元の事実ではなく、呼び出しの側の誤りである */
export class InvalidRevisionError extends AppError {
  readonly code = 'git.invalid_revision';
}
