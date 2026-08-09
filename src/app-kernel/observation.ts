import type { AppError } from './error.ts';

/* この道具の中核の語彙。

   観察の道具が吐く嘘は 2 種類ある。**見に行けなかったのに「空」と答える**(観る人は
   「何も起きていない」と読む)。**空だったのに「壊れた」と答える**(見えるはずの盤面が隠れる)。

   旧実装はここを潰していた — プロセスの一覧に失敗すると空の配列を返すので、待っている
   セッションが全部「終わった」ものとして並ぶ。git が入っていない機械では、すべての
   リポジトリが「リポジトリではない」と出る。どちらも、観る人には見分けが付かない。

   だから外の世界を読む口は、すべてこの 3 つのどれかを返す。 */

export type AbsentReason =
  /** 観測元そのものが無い(台帳が無い、そこがリポジトリでない) */
  | 'no-source'
  /** 在るが中身が無い */
  | 'empty'
  /** わざと引いた線の外(7 日より古い、末尾 4MiB より前)。読んでいないのであって、無いのではない */
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

/* 見えたときだけ値、それ以外は代わりの値。**理由がここで消える**ので、
   使うのは画面へ渡す直前だけにし、なぜ潰してよいのかを毎回そばに書くこと。 */
export const valueOr = <T>(o: Observation<T>, fallback: T): T =>
  o.kind === 'observed' ? o.value : fallback;

/** すべて見えたときだけ観測とする。1 つでも見に行けなければ、その理由をそのまま返す */
export function allObserved<T>(os: readonly Observation<T>[]): Observation<T[]> {
  const values: T[] = [];
  for (const o of os) {
    if (o.kind !== 'observed') return o;
    values.push(o.value);
  }
  return observed(values);
}
