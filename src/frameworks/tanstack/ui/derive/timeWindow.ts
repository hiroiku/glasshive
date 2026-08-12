/* 一度に見る時間の幅。**画面をまたいで同じ語彙にする。**

   ウォーターフォールと Tokens は同じ時間軸の上に在るのに、選べる幅が違うと片方で掴んだ
   感覚がもう片方で通じない。選択肢はここ 1 か所で決める。

   刻みは Claude Code の定額枠に合わせてある —— 5h と 7d はそのまま枠 1 つぶんで、
   30m / 1h / 1d はその中を刻んで読むための幅である。 */

import { englishTranslator, type Translator } from '~/interface/i18n/translator.ts';

/** `auto` は「実際に在るものがちょうど収まる幅」 */
export type TimeWindow = 'auto' | number;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** 定額枠の期間の長さ。`transcript` から観測できる範囲での近似で、課金側の正とは一致しない */
export const QUOTA_WINDOW_MS = 5 * HOUR_MS;

/** いちばん狭い幅。これより狭い軸には目盛りが置けない */
export const MIN_WINDOW_MS = 30 * 60_000;

/** いちばん広い幅。素材がここまでしか遡らない */
export const MAX_WINDOW_MS = 7 * DAY_MS;

export interface WindowChip {
  readonly key: TimeWindow;
  /** URL とテストが見ている名前。訳さない */
  readonly label: string;
  /** チップに出す言葉。`30m` のような幅そのものの綴りは、どの言葉でもそのまま読める */
  readonly text: string;
  readonly title: string;
}

export const windowChips = (t: Translator): readonly WindowChip[] => [
  {
    key: 'auto',
    label: 'Auto',
    text: t('Auto'),
    title: t('The narrowest of these that still shows everything'),
  },
  { key: MIN_WINDOW_MS, label: '30m', text: '30m', title: t('The last 30 minutes') },
  { key: HOUR_MS, label: '1h', text: '1h', title: t('The last hour') },
  {
    key: QUOTA_WINDOW_MS,
    label: '5h',
    text: '5h',
    title: t("Claude Code's 5h quota window in one view"),
  },
  { key: DAY_MS, label: '1d', text: '1d', title: t('The last day') },
  {
    key: MAX_WINDOW_MS,
    label: '7d',
    text: '7d',
    title: t("Claude Code's weekly quota window in one view"),
  },
];

/** 幅そのものを見るところ用。訳の要らない `key` と `label` だけを当てにする */
export const WINDOWS: readonly WindowChip[] = windowChips(englishTranslator);

/** 選べる幅だけを、狭い順に */
const STEPS: readonly number[] = WINDOWS.map((window) => window.key).filter(
  (key): key is number => typeof key === 'number',
);

/* `auto` の幅を決める。**いちばん古い記録が入る、いちばん狭い幅を採る。**

   ちょうどの幅に切らずに刻みへ丸めるのは、`auto` と手で選んだ幅が同じ軸になるためである。
   丸めないと、`auto` から `5h` へ移った瞬間にバーの数も足の長さも変わって、同じものを
   見ているのかどうかが読めなくなる。

   何も見つからなかったときは、いちばん狭い幅に落とす —— 広い幅で空を出すと、
   「静かだった」のか「まだ何も無い」のかが同じ絵になる。 */
export function autoWindow(oldestMs: number | null, nowMs: number): number {
  if (oldestMs === null || !Number.isFinite(oldestMs)) return MIN_WINDOW_MS;
  const span = nowMs - oldestMs;
  return STEPS.find((step) => step >= span) ?? MAX_WINDOW_MS;
}

/** 幅を読める言葉に。1 時間より短ければ分、1 日より短ければ時間 */
export const windowLabel = (ms: number): string =>
  ms < HOUR_MS
    ? `${Math.round(ms / 60_000)}m`
    : ms < DAY_MS
      ? `${Math.round(ms / HOUR_MS)}h`
      : `${Math.round(ms / DAY_MS)}d`;
