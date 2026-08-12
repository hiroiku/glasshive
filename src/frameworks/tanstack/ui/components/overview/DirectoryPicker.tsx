import type { PreferencesJson } from '~/interface/presenters/workspace/preferences.presenter.ts';
import { formatSinceIso } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';

/* 見つけたが、まだ観ると決めていないディレクトリ。

   **一覧に出るのは、観ると決めたものだけである。** 見つけたものまで並べると、glasshive は
   また「機械の中の Claude Code を全部並べるもの」に戻る。それでも見つけたことは伝える ——
   伝えないと、Claude Code を走らせたことのあるディレクトリを画面から選べない。

   選ぶのは名前(id)で、パスではない。**画面はパスを名指せない** —— 名指せると、開いている
   どのページも任意のディレクトリを glasshive に読ませられる。ここに並ぶのは、こちらが
   走査で見つけたものだけである。 */

interface DirectoryPickerProps {
  readonly candidates: PreferencesJson['candidates'];
  readonly onWatch: (id: string) => void;
  /** 最初から開いておくか。まだ 1 つも観ていない画面では、ここから選ぶ以外にすることが無い */
  readonly open: boolean;
  readonly nowMs: number;
}

export function DirectoryPicker({ candidates, onWatch, open, nowMs }: DirectoryPickerProps) {
  const t = useT();
  // 見つからなかったのなら、畳んだ見出しだけが残っても押す先が無い
  if (candidates.length === 0) return null;

  return (
    <details className="picker" open={open}>
      <summary>
        {t(
          '{n, plural, one {# directory found that you are not watching} other {# directories found that you are not watching}}',
          { n: candidates.length },
        )}
      </summary>
      <ul className="picker-list">
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <button type="button" className="picker-add" onClick={() => onWatch(candidate.id)}>
              {t('Watch')}
            </button>
            <span className="picker-name">{candidate.name}</span>
            {/* 場所を読めていないことを、場所が無いことと同じ顔で出さない */}
            <span className="picker-path">
              {candidate.path ?? t('could not read where this is')}
            </span>
            <span className="picker-when">{formatSinceIso(t, candidate.last_activity, nowMs)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
