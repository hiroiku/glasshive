import { AppError } from '~/app-kernel/error.ts';

/** git へ渡せない形の指しが求めに載っていた。観測元の事実ではなく、求めの側の誤りである */
export class InvalidRevisionError extends AppError {
  readonly code = 'git.invalid_revision';
}
