import type { AppError } from './error.ts';

/* 「その呼び出しを受けてよいか」を表す。

   使うのは層の境界だけ — 形の検証と、読んでよいパスかどうかの判定。
   観測できたかどうかは `Result` ではなく `Observation` で表す(`observation.ts`)。
   2 つを分けているのは、断るべき呼び出しと、観測できなかった事実が別のものだからである。
   **混ぜると、画面は「呼び出しの形が間違っている」と「プロジェクトの側が黙っている」を
   見分けられなくなる。** */

export type Result<T, E extends AppError = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E extends AppError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export const isOk = <T, E extends AppError>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

export const mapResult = <T, U, E extends AppError>(
  r: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => (r.ok ? ok(f(r.value)) : r);

export const unwrapOr = <T, E extends AppError>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;
