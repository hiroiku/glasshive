import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IssuesLegend } from '~/frameworks/tanstack/ui/components/issues/Legend.tsx';
import type { EventLog } from '~/frameworks/tanstack/ui/derive/issueEvents.ts';

/* 凡例は、右のトラックの下地が何を言っているかの唯一の説明である。

   罫線とハッチと破線の違いは、読み終えて何も起きていなかった行と、読めなかった行と、
   まだ読んでいる行の見分け方そのものである。**見分け方がここに無ければ、4 通りの絵は
   ただの模様になる。** 見本も説明の文も、落ちても画面は出てしまう。 */

const WHOLE: EventLog = { kind: 'observed', complete: true, byId: new Map() };
const PARTIAL: EventLog = { kind: 'observed', complete: false, byId: new Map() };

describe('一覧の凡例', () => {
  it('読み切れていない記録が在るなら、ハッチの見分け方を言う', () => {
    const whole = render(<IssuesLegend complete events={WHOLE} />);
    const partial = render(<IssuesLegend complete events={PARTIAL} />);
    const reading = render(<IssuesLegend complete events={{ kind: 'reading' }} />);

    expect(
      partial.container.textContent,
      'ハッチの掛かった行が何なのかを言わないと、空の行と同じに読まれる',
    ).toContain('hatched, not empty');
    expect(
      whole.container.textContent,
      '全部読めているのに読み残しを言うと、無い読み残しを言うことになる',
    ).not.toContain('hatched, not empty');
    expect(
      reading.container.textContent,
      'まだ読んでいる最中は、読み残しが在るかどうかも分かっていない',
    ).not.toContain('hatched, not empty');
  });

  it('下地の見本は、行と同じ class から採る', () => {
    const { container } = render(<IssuesLegend complete events={WHOLE} />);
    const grounds = [...container.querySelectorAll('.lg-gt > i')].map((node) => node.className);

    expect(grounds.filter((cls) => cls === 'gt-rule').length, '読めた行の見本は 1 つである').toBe(
      1,
    );
    expect(
      grounds,
      '読めなかった行の見本を罫線にすると、読めた行と同じ絵で別のことを説明することになる',
    ).toContain('gt unread');
    expect(grounds, '読んでいる最中の見本も要る').toContain('gt reading');
  });

  it('依存を取り切れていないなら、弧が欠けていることを言う', () => {
    const partial = render(<IssuesLegend complete={false} events={WHOLE} />);
    const whole = render(<IssuesLegend complete events={WHOLE} />);

    expect(
      partial.container.textContent,
      '欠けた弧を黙ると、堰き止められていない課題として読まれる',
    ).toContain('arcs may be missing');
    expect(whole.container.textContent).not.toContain('arcs may be missing');
  });
});
