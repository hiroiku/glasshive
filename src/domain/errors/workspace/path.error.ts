import { AppError } from '~/app-kernel/error.ts';

/** パスとして使えない文字列が渡された。呼び出しの側の誤りであって、観測元の事実ではない */
export class InvalidPathError extends AppError {
  readonly code = 'workspace.invalid_path';
}

/** 読んでよいパスの範囲の外を指している */
export class OutOfScopePathError extends AppError {
  readonly code = 'workspace.out_of_scope';
}
