/* モデルの名前。

   `<synthetic>` は道具の側が差し込む合成メッセージの目印であって、モデルの名前ではない。
   これをモデルとして扱うと、セッションのモデル欄が合成メッセージのたびに書き換わり、
   トークンの数えにも実体の無い行が混じる。 */

export const SYNTHETIC_MODEL = '<synthetic>';

/** モデル名の代わりに使う名前。usage は在るのにモデル名が無い行のため */
export const UNKNOWN_MODEL = 'unknown';

export const isSyntheticModel = (model: string): boolean => model === SYNTHETIC_MODEL;
