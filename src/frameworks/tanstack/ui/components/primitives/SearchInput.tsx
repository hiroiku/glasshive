import { useEffect, useRef, useState } from 'react';

/* 検索欄。日本語入力の変換を、打ち終わるまで邪魔しない。

   **変換の途中で `value` を書き戻さない。** 親から受けた値をそのまま `value` に渡すと、
   1 文字打つたびに親が描き直し、React が DOM の `value` を上書きして、変換がそこで確定する。
   「えふぉーと」と打ちたいのに「えfおーtお」になるのがこれである。

   打っている最中の文字はこの中に持ち、外へ渡すのは変換が終わってからにする。外の値が
   変わったときだけ、持っている文字を入れ替える。 */

export interface SearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  /** 読み上げに出す名前。既定は placeholder と同じ */
  readonly label?: string | undefined;
}

export function SearchInput({ value, onChange, placeholder, label }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  /* 変換中かどうか。描き直しを跨いで残り、変わっても描き直す必要が無いので ref に置く */
  const composing = useRef(false);
  /* 親から前に受け取った値。**自分が渡した値が返ってきただけなのか、外で変わったのかを分ける。**
     `navigate` は非同期なので、打った直後の描き直しでは親の値がまだ 1 文字前を指している。
     そこで打っている文字を親の値で上書きすると、打った端から消える。 */
  const seen = useRef(value);

  useEffect(() => {
    if (value === seen.current) return;
    seen.current = value;
    // 変換中に外から入れ替えない。変換中の文字を消すより、遅れて反映するほうが良い
    if (composing.current) return;
    setDraft(value);
  }, [value]);

  const send = (next: string) => {
    seen.current = next;
    onChange(next);
  };

  return (
    <input
      className="search"
      type="search"
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      value={draft}
      onChange={(event) => {
        /* 変換中でも持っている文字は進める。**進めないと React が DOM を書き戻して変換が切れる** —
           `value` が DOM の中身と同じである限り、React は DOM に触らない。 */
        setDraft(event.target.value);
        if (!composing.current) send(event.target.value);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        /* 確定した文字は `onChange` より後に届くことがある。ここで読んだものを最後の値とする */
        const next = event.currentTarget.value;
        setDraft(next);
        send(next);
      }}
    />
  );
}
