import { describe, expect, it } from 'vitest';
import { issueTypeColor } from '~/frameworks/tanstack/ui/derive/githubIssue.ts';

/** 課題の形は関数そのものから引く。書き写すと、形が変わってもテストが気づけない */
type IssueSummaryJson = Parameters<typeof issueTypeColor>[0];

/* GitHub は課題の型の色を `IssueTypeColor` の enum 名で返す。**16 進数ではない。**
   ラベルの色と同じつもりで `#` を付けると `#RED` になり、`color-mix()` が
   computed-value 時に無効になって、チップの枠も背景も文字色もまとめて落ちる。 */

const withColor = (color: string | null): IssueSummaryJson =>
  ({ github: { issue_type_color: color } }) as unknown as IssueSummaryJson;

describe('課題の型の色', () => {
  it('enum の名前から、この画面で使う色を引く', () => {
    expect(issueTypeColor(withColor('RED'))).toBe('#f87171');
    expect(issueTypeColor(withColor('PURPLE'))).toBe('#c084fc');
  });

  it('GitHub が返す 8 色すべてを引ける', () => {
    const names = ['GRAY', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE'];
    const drawn = names.map((name) => issueTypeColor(withColor(name)));

    expect(drawn.filter((color) => color !== null)).toHaveLength(names.length);
    expect(new Set(drawn).size, '2 つの型が同じ色になると、色で見分けられなくなる').toBe(
      names.length,
    );
  });

  it('引いた色はそのまま CSS に渡せる形である', () => {
    for (const name of ['GRAY', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE']) {
      expect(
        issueTypeColor(withColor(name)),
        '`#` を付け足す側が居ると、また `#RED` に戻る',
      ).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('知らない名前には色を決めない', () => {
    expect(
      issueTypeColor(withColor('TEAL')),
      '手近な色を当てると、GitHub が別の色で見せている型を塗り替えることになる',
    ).toBeNull();
    expect(issueTypeColor(withColor('red'))).toBeNull();
  });

  it('色を持たない課題は `null`', () => {
    expect(issueTypeColor(withColor(null))).toBeNull();
    expect(issueTypeColor({} as unknown as IssueSummaryJson)).toBeNull();
  });
});
