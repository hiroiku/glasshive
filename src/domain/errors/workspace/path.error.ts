import { AppError } from '~/app-kernel/error.ts';

/** 場所として使えない名前が渡された。求めの側の誤りであって、観測元の事実ではない */
export class InvalidPathError extends AppError {
  readonly code = 'workspace.invalid_path';
}

/** 見てよい場所の外を指している */
export class OutOfScopePathError extends AppError {
  readonly code = 'workspace.out_of_scope';
}
