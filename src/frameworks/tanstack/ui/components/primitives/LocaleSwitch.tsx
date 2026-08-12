import { mdiCheck, mdiTranslate } from '@mdi/js';
import { useEffect, useRef, useState } from 'react';
import { LOCALE_NAMES, LOCALES, type Locale } from '~/interface/i18n/locale.ts';
import { useLocaleChoice } from '../../i18n/LocaleContext';
import { useT } from '../../i18n/useT.ts';
import { Icon } from './Icon.tsx';

/* 画面の言葉を選ぶ。

   一覧に出す名前は、その言葉自身で書いてある。**英語の名前を並べない** —— 読めない言葉の
   画面から自分の言葉を探すことになるのは、いま読めない画面に居る人だからである。名前は
   `lang` を添えて出すので、同じ漢字でも簡体字・繁体字・日本語がそれぞれの書体で出る。

   選ばない、という選び方を残す。選び直せる先が無いと、一度選んだ人はブラウザーが名乗る
   言葉へ戻れなくなる。その行には、いま当たっている言葉を添える —— 「ブラウザーに合わせる」
   だけでは、それが何になるのかが画面のどこにも出ない。

   ブラウザーの `select` を使わない。中身の見た目は OS が決めるので、名前ごとの `lang` も、
   選ばれている行に添えるアイコンも、この画面の色も届かない。 */

/** 「選ばない」を表す行。言葉の綴りと重ならないよう、`Locale` ではなく `null` で持つ */
const FOLLOW = null;

type Choice = Locale | typeof FOLLOW;

const CHOICES: readonly Choice[] = [FOLLOW, ...LOCALES];

export function LocaleSwitch() {
  const t = useT();
  const { locale, chosen, choose } = useLocaleChoice();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* 開いたら、いま選ばれている行へ焦点を移す。開いた先が先頭に固定されていると、
     キーボードだけで使う人は毎回そこから数え直すことになる */
  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.focus();
  }, [open, active]);

  const pick = (choice: Choice) => {
    choose(choice);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const move = (to: number) => setActive((to + CHOICES.length) % CHOICES.length);

  const openAt = () => {
    setActive(Math.max(0, CHOICES.indexOf(chosen)));
    setOpen(true);
  };

  return (
    /* 押しどころと一覧を 1 つの入れ物に入れておく。焦点がこの外へ出たときが閉じるときで、
       それは外を押したときとタブで抜けたときの両方を指す */
    // biome-ignore lint/a11y/noStaticElementInteractions: 焦点が外れたことを受けるだけの入れ物
    <div
      className="lsw"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        id="locale-switch"
        className={`fchip lsw-btn${open ? ' on' : ''}`}
        ref={buttonRef}
        aria-label={t('Language of this interface')}
        title={t('Language of this interface. Observed text is never translated')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openAt();
          }
        }}
      >
        <Icon path={mdiTranslate} size={12} />
        <span className="lsw-cur" lang={locale}>
          {LOCALE_NAMES[locale]}
        </span>
      </button>

      {open && (
        <div
          className="lsw-menu"
          role="listbox"
          aria-label={t('Language of this interface')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              buttonRef.current?.focus();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(active + 1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(active - 1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              move(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              move(CHOICES.length - 1);
            } else if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
        >
          {CHOICES.map((choice, index) => (
            <button
              type="button"
              key={choice ?? 'follow'}
              className={`lsw-opt${choice === FOLLOW ? ' lsw-follow' : ''}`}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={choice === chosen}
              tabIndex={index === active ? 0 : -1}
              onClick={() => pick(choice)}
              onFocus={() => setActive(index)}
            >
              {/* 選ばれている行にチェックを置く。その場所は空けたままにするので、
                  選び直しても名前が横に動かない */}
              <span className="lsw-mark">
                {choice === chosen && <Icon path={mdiCheck} size={12} />}
              </span>
              {choice === FOLLOW ? (
                <>
                  <span className="lsw-name">{t('Follow browser')}</span>
                  {/* いま何に当たっているかを添える。合わせた先が読めないと、
                      この行を選ぶかどうかが決められない */}
                  <span className="lsw-hint" lang={locale}>
                    {LOCALE_NAMES[locale]}
                  </span>
                </>
              ) : (
                <span className="lsw-name" lang={choice}>
                  {LOCALE_NAMES[choice]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
