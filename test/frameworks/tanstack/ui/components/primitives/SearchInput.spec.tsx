import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from '~/frameworks/tanstack/ui/components/primitives/SearchInput.tsx';

/* 検索欄。

   日本語入力は、確定するまでの間ずっと入力欄の中身を書き換えながら進む。その途中で
   React が `value` を DOM へ書き戻すと、変換はそこで確定してしまう。「えふぉーと」と
   打ったのに「えfおーtお」が残るのがそれである。

   ここで見るのは、変換の途中で外へ渡さないことと、渡さない間も入力欄の中身を
   奪わないことの 2 つである。 */

const inputOf = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input.search');
  if (input === null) throw new Error('SearchInput did not render an input');
  return input as HTMLInputElement;
};

describe('SearchInput の日本語入力', () => {
  it('変換の途中では外へ渡さない', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput value="" onChange={onChange} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'え' } });
    fireEvent.change(input, { target: { value: 'えf' } });
    fireEvent.change(input, { target: { value: 'えふぉ' } });

    expect(onChange, '変換の途中で渡すと、親が描き直して変換が確定する').not.toHaveBeenCalled();
  });

  it('変換の途中でも入力欄の中身は進む', () => {
    const { container } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'えふぉ' } });

    expect(input.value, 'React の `value` が DOM と食い違うと、書き戻されて変換が切れる').toBe(
      'えふぉ',
    );
  });

  it('親が描き直しても、変換中の文字を書き戻さない', () => {
    const { container, rerender } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'えふぉ' } });
    // 変更通知などで、変換とは関係のない描き直しが挟まる
    rerender(<SearchInput value="" onChange={() => {}} placeholder="Search issues…" />);

    expect(input.value, '打っている最中の文字を消すと、変換がそこで確定する').toBe('えふぉ');
  });

  it('確定したら、確定した文字を渡す', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput value="" onChange={onChange} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'えふぉーと' } });
    fireEvent.compositionEnd(input);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('えふぉーと');
  });

  it('確定した後は、また 1 文字ずつ渡す', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput value="" onChange={onChange} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'あ' } });
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: 'あa' } });

    expect(onChange.mock.calls.map((call) => call[0])).toEqual(['あ', 'あa']);
  });
});

describe('SearchInput と親の値', () => {
  it('親の反映が遅れても、打った文字を消さない', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SearchInput value="" onChange={onChange} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.change(input, { target: { value: 'a' } });
    /* `navigate` は非同期なので、打った直後の描き直しでは親の値がまだ 1 文字前を指している。
       これを入力欄へ書き戻すと、打った端から消える。 */
    rerender(<SearchInput value="" onChange={onChange} placeholder="Search issues…" />);

    expect(input.value).toBe('a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('外から語を指されたら、その語に入れ替わる', () => {
    const { container, rerender } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search issues…" />,
    );
    const input = inputOf(container);

    fireEvent.change(input, { target: { value: 'ab' } });
    // 別の画面から「この語で絞る」と言われて来た
    rerender(<SearchInput value="feature" onChange={() => {}} placeholder="Search issues…" />);

    expect(input.value, 'チップや別の画面から指した語が効かないのでは、行き先にならない').toBe(
      'feature',
    );
  });

  it('読み上げの名前は、既定では placeholder と同じ', () => {
    const { container } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search issues…" />,
    );

    expect(inputOf(container).getAttribute('aria-label')).toBe('Search issues…');
  });
});
