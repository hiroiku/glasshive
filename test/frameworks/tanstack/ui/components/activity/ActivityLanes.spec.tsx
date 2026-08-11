import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ActivityLanes,
  type ActivityRow,
} from '~/frameworks/tanstack/ui/components/activity/ActivityLanes.tsx';

/* サイドパネルの稼働レーン。

   **観測できなかった行を、レーンごと落とさない。** 落とすと、そのエージェントは
   「関わっていなかった」ように読める。見出しは絞り込む前の行数で出るので、
   1 人しか居ない課題では見出しだけが出て中身が空になる。 */

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({ openConv: vi.fn() }),
}));

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const at = (ms: number) => new Date(NOW - ms).toISOString();

/* 材料の形は、レーンが受け取る形そのものから引く。**書き写さない** ——
   写すと、向こう側の形が変わってもこのテストだけが通り続ける。 */
type SessionJson = Extract<ActivityRow['node'], { subagents: unknown[] }>;

const node = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 'session-1',
  file: '/w/one.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: at(1_800_000),
  last_activity: at(600_000),
  tokens: null,
  tokens_state: 'observed',
  model: null,
  effort: null,
  git_branch: null,
  cwd: null,
  issues: [],
  current: null,
  intervals: [],
  intervals_complete: true,
  intervals_state: 'observed',
  size: 4096,
  sources: { state: 'observed', reason: null },
  subagents: [],
  ...over,
});

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  file: '/w/one.jsonl',
  state: 'ended',
  label: 'one',
  where: 'main',
  node: node(),
  ...over,
});

const draw = (rows: readonly ActivityRow[]) => render(<ActivityLanes rows={rows} nowMs={NOW} />);

const lanesOf = (container: HTMLElement) => [...container.querySelectorAll('.alane')];

describe('稼働を観測できなかったエージェント', () => {
  const unread = row({ node: node({ intervals_state: 'unobservable' }) });

  it('レーンを残す', () => {
    const { container } = draw([unread]);

    expect(lanesOf(container), '読めなかったエージェントが一覧から消えている').toHaveLength(1);
  });

  it('稼働の棒では描かない', () => {
    const { container } = draw([unread]);
    const bars = [...container.querySelectorAll('.bar')];

    expect(bars).toHaveLength(1);
    expect(bars[0]?.className, '観測ゼロから稼働を主張している').toContain('unknown');
  });

  it('読めなかったことを、指せば分かるようにする', () => {
    const { container } = draw([unread]);

    expect(container.querySelector('.bar')?.getAttribute('title')).toContain(
      'activity could not be read',
    );
  });

  /* 読めた人だけを残すと、読めなかった人が黙って消える。 */
  it('読めた人と並べて出す', () => {
    const { container } = draw([
      row({ node: node({ intervals: [[at(1_800_000), at(1_200_000)]] }) }),
      row({
        file: '/w/two.jsonl',
        label: 'two',
        node: node({ id: 'session-2', file: '/w/two.jsonl', intervals_state: 'unobservable' }),
      }),
    ]);

    expect(lanesOf(container)).toHaveLength(2);
    expect(container.querySelectorAll('.bar.unknown')).toHaveLength(1);
  });

  /* 起点が時刻として読めないだけの行を落とすと、`intervalsOf` も空を返すので、
     そのエージェントがレーンごと消える。最後の動きが読めるなら、そこで細線を引く。 */
  it('起点が時刻として読めなくても、最後の動きでレーンを残す', () => {
    const { container } = draw([
      row({ node: node({ intervals_state: 'unobservable', started: 'いつか' }) }),
    ]);

    expect(lanesOf(container), '起点が読めないだけで一覧から消えている').toHaveLength(1);
    expect(container.querySelector('.bar.unknown')).not.toBeNull();
  });

  /* 軸は並ぶ行だけで決める。読めなかった行の幅を数えないと、その細線が軸からはみ出す。 */
  it('読めなかった行だけでも、軸の両端を出す', () => {
    const { container } = draw([unread]);

    expect(container.querySelectorAll('.alane-axis span')).toHaveLength(2);
  });
});

describe('稼働を観測できたエージェント', () => {
  it('書かれている稼働区間を棒にする', () => {
    const { container } = draw([
      row({
        node: node({
          intervals: [
            [at(1_800_000), at(1_500_000)],
            [at(1_200_000), at(600_000)],
          ],
        }),
      }),
    ]);

    expect(container.querySelectorAll('.alane-tl .bar')).toHaveLength(2);
    expect(container.querySelector('.bar.unknown')).toBeNull();
  });

  it('区間が 1 本も無くても、起点と最後の動きで 1 本描く', () => {
    const { container } = draw([row({ node: node({ intervals_state: 'absent' }) })]);

    expect(container.querySelectorAll('.alane-tl .bar')).toHaveLength(1);
    expect(container.querySelector('.bar.unknown')).toBeNull();
  });
});

describe('描く行が 1 つも無いとき', () => {
  it('何も描かない', () => {
    const { container } = draw([]);

    expect(container.innerHTML).toBe('');
  });

  it('時刻として読めない行だけなら、何も描かない', () => {
    const { container } = draw([
      row({
        node: node({
          intervals_state: 'unobservable',
          started: 'いつか',
          last_activity: 'そのうち',
        }),
      }),
    ]);

    expect(container.innerHTML).toBe('');
  });
});
