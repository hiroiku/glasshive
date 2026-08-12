import type { Translator } from '~/interface/i18n/translator.ts';

/* 決まった語彙を、画面の言葉にする。

   状態も PR の状態も、値そのものは観測した記録から来るが、取りうる値はこちらで数え上げられる
   閉じた集合である。**`t(value)` とは書けない** —— 訳の鍵が画面のコードから取り出せなくなり、
   訳が揃っているかを誰も数えられなくなる。取りうる値ぶんの `t('…')` をここに並べておけば、
   数え上げから漏れた値が来ても、観測した綴りのまま出せる。 */

/** 課題の状態。`not_planned` は「やらないことにした」で、`closed` とは別の終わり方である */
export function statusLabel(t: Translator, status: string): string {
  if (status === 'open') return t('open');
  if (status === 'blocked') return t('blocked');
  if (status === 'closed') return t('closed');
  if (status === 'not_planned') return t('not planned');
  return status;
}

/** セッションとサブエージェントの 3 状態 */
export function sessionStateLabel(t: Translator, state: string): string {
  if (state === 'active') return t('active');
  if (state === 'waiting') return t('waiting');
  if (state === 'ended') return t('ended');
  return state;
}

/** PR の状態。`GithubPullRequest.state` は `OPEN` / `CLOSED` / `MERGED` の大文字で届く */
export function pullStateLabel(t: Translator, state: string): string {
  const lower = state.toLowerCase();
  if (lower === 'open') return t('open');
  if (lower === 'closed') return t('closed');
  if (lower === 'merged') return t('merged');
  return lower;
}

/** レビューの結果。`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED` の大文字で届く */
export function reviewLabel(t: Translator, decision: string): string {
  const lower = decision.toLowerCase();
  if (lower === 'approved') return t('approved');
  if (lower === 'changes_requested') return t('changes requested');
  if (lower === 'review_required') return t('review required');
  return lower;
}

/** 依存の種類。`deps` の語のままだと向きが読めない */
export function depLabel(t: Translator, type: string): string {
  if (type === 'parent-child') return t('parent');
  if (type === 'blocks') return t('blocked by');
  if (type === 'related') return t('related');
  if (type === 'duplicates') return t('duplicates');
  if (type === 'supersedes') return t('supersedes');
  if (type === 'discovered-from') return t('discovered from');
  return type;
}
