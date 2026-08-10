import type { AppError } from './error.ts';

/* glasshive 全体で共有する語彙。

   観測ツールが吐く嘘は 2 種類ある。観測できなかったのに「空」と答えると、ユーザーは
   「何も起きていない」と読む。空だったのに「エラー」と答えると、見えるはずの状態が隠れる。
   プロセス一覧に失敗して空の配列を返せば待機中のセッションが全部「終了」に見えるし、
   git が入っていない機械ではすべてのリポジトリが「リポジトリではない」と出る。
   **この 2 つを潰さないことが、この型の唯一の目的である。**

   だから外の世界を読むポートは、すべてこの 3 つのどれかを返す。 */

export type AbsentReason =
  /** 観測元そのものが無い(台帳が無い、そこがリポジトリでない) */
  | 'no-source'
  /** 在るが中身が無い */
  | 'empty'
  /** 意図して引いた線の外(7 日より古い、末尾 4MiB より前)。読んでいないのであって、無いのではない */
  | 'out-of-window';

export type Observation<T> =
  | { readonly kind: 'observed'; readonly value: T }
  | { readonly kind: 'absent'; readonly reason: AbsentReason }
  | { readonly kind: 'unobservable'; readonly error: AppError };

export const observed = <T>(value: T): Observation<T> => ({
  kind: 'observed',
  value,
});
export const absent = (reason: AbsentReason): Observation<never> => ({
  kind: 'absent',
  reason,
});
export const unobservable = (error: AppError): Observation<never> => ({
  kind: 'unobservable',
  error,
});

export const isObserved = <T>(o: Observation<T>): o is { kind: 'observed'; value: T } =>
  o.kind === 'observed';

export const mapObserved = <T, U>(o: Observation<T>, f: (value: T) => U): Observation<U> =>
  o.kind === 'observed' ? observed(f(o.value)) : o;

/* 観測できたときだけ値を返し、それ以外は fallback を返す。**理由がここで消える**ので、
   使うのは画面へ渡す直前だけにし、なぜ潰してよいのかを毎回そばに書くこと。 */
export const valueOr = <T>(o: Observation<T>, fallback: T): T =>
  o.kind === 'observed' ? o.value : fallback;

/** すべて観測できたときだけ `observed` にする。1 つでも観測できなければ、その理由をそのまま返す */
export function allObserved<T>(os: readonly Observation<T>[]): Observation<T[]> {
  const values: T[] = [];
  for (const o of os) {
    if (o.kind !== 'observed') return o;
    values.push(o.value);
  }
  return observed(values);
}
