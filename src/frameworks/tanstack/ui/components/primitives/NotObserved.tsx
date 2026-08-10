import { mdiAlertOutline } from '@mdi/js';
import { Icon } from './Icon.tsx';

/* 観測できなかったことを伝える板。

   **「読めませんでした」で終わらせない。** glasshive にとって、見に行けなかったことは
   何も起きていないことと同じくらい重要な事実である。伝えるべきは 3 つ ——
   何を見に行ったのか、どこで止まったのか、次に何をすれば見えるのか。

   エラーコードも隠さずに出す。ここに出しておけば、案内が当たらなかったときに
   その語で調べられる。 */

export interface NotObservedStep {
  /** 手立ての説明 */
  readonly text: string;
  /** 打つコマンド。無ければ説明だけ */
  readonly command?: string | undefined;
  readonly href?: string | undefined;
}

export interface NotObservedProps {
  /** mdi のパス。何を見に行ったのかを一目で言う */
  readonly icon: string;
  readonly title: string;
  /** 何を見に行って、どこで止まったのか */
  readonly detail: string;
  /** エラーコード。無ければ出さない */
  readonly code?: string | null | undefined;
  readonly steps?: readonly NotObservedStep[] | undefined;
  /** 見えなくなっているのが観測の一部だけなら、そう言う */
  readonly partial?: boolean | undefined;
}

export function NotObserved({ icon, title, detail, code, steps, partial }: NotObservedProps) {
  return (
    <div className={`not-observed${partial === true ? ' partial' : ''}`}>
      <div className="no-head">
        <Icon path={partial === true ? mdiAlertOutline : icon} size={13} />
        <span className="no-title">{title}</span>
        {code !== null && code !== undefined && <code className="no-code">{code}</code>}
      </div>
      <p className="no-detail">{detail}</p>
      {steps !== undefined && steps.length > 0 && (
        <ol className="no-steps">
          {steps.map((step) => (
            <li key={step.text}>
              <span>{step.text}</span>
              {step.command !== undefined && <code>{step.command}</code>}
              {step.href !== undefined && (
                <a href={step.href} target="_blank" rel="noopener">
                  {step.href.replace(/^https?:\/\//, '')} →
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
