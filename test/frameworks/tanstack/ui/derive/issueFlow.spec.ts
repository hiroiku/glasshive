import { describe, expect, it } from 'vitest';
import { FLOW_BARS, FLOW_SPAN_MS, flowSeries } from '~/frameworks/tanstack/ui/derive/issueFlow.ts';
import { DAY_MS } from '~/frameworks/tanstack/ui/derive/timeWindow.ts';

/* 課題の増減の移り変わり。

   見るのは 3 つ —— 開いている数がその時点で開いていたものの数であること、閉じた時刻に
   `closed_at` を読むこと、そして `not_planned` も閉じたものとして数えること。 */

type IssueSummaryJson = Parameters<typeof flowSeries>[0][number];

const NOW = Date.parse('2026-08-09T12:00:00Z');

const iso = (atMs: number): string => new Date(atMs).toISOString();

const issue = (over: Partial<IssueSummaryJson> = {}): IssueSummaryJson =>
  ({
    id: '#1',
    title: 'Widen the health check window',
    status: 'open',
    issue_type: null,
    labels: null,
    assignee: null,
    created_at: null,
    updated_at: null,
    closed_at: null,
    deps: [],
    deps_complete: true,
    github: {
      url: null,
      labels: [],
      assignees: [],
      author: null,
      milestone: null,
      issue_type_color: null,
      sub_issues: null,
      pull_requests: [],
      comments: 0,
      reactions: 0,
    },
    ...over,
  }) as IssueSummaryJson;

/** 最後のバー。いまの時点の数 */
const last = (values: readonly number[]): number => values[values.length - 1] ?? Number.NaN;

describe('課題の増減', () => {
  it('バーの数は決まっている', () => {
    const series = flowSeries([], NOW);

    expect(series.open).toHaveLength(FLOW_BARS);
    expect(series.closed).toHaveLength(FLOW_BARS);
  });

  it('開いたままの課題は、作られてからずっと数に入る', () => {
    const series = flowSeries([issue({ created_at: iso(NOW - 10 * DAY_MS) })], NOW);

    expect(last(series.open)).toBe(1);
    expect(last(series.closed)).toBe(0);
  });

  it('閉じた課題は `closed_at` で数から外れる', () => {
    const series = flowSeries(
      [
        issue({
          status: 'closed',
          created_at: iso(NOW - 10 * DAY_MS),
          /* 閉じた後に触られた課題。**`updated_at` を当てると外れる時点がずれる** */
          updated_at: iso(NOW - 1 * DAY_MS),
          closed_at: iso(NOW - 8 * DAY_MS),
        }),
      ],
      NOW,
    );

    const step = FLOW_SPAN_MS / FLOW_BARS;
    /* 閉じた時刻の直後のバー。ここで既に閉じていなければ、閉じた時刻を読めていない */
    const bar = Math.floor((FLOW_SPAN_MS - 8 * DAY_MS) / step);

    expect(series.open[bar]).toBe(0);
    expect(series.closed[bar]).toBe(1);
  });

  it('`not_planned` も閉じたものとして数える', () => {
    const series = flowSeries(
      [
        issue({
          status: 'not_planned',
          created_at: iso(NOW - 10 * DAY_MS),
          closed_at: iso(NOW - 5 * DAY_MS),
        }),
      ],
      NOW,
    );

    expect(last(series.open), 'やらないと決めた課題は開いたまま積み上がらない').toBe(0);
    expect(last(series.closed)).toBe(1);
  });

  it('閉じているのに時刻をどちらも読めない課題は、閉じた数に入らない', () => {
    const series = flowSeries(
      [issue({ status: 'closed', created_at: iso(NOW - 10 * DAY_MS) })],
      NOW,
    );

    expect(
      last(series.closed),
      'いつ閉じたか観測できていないものを、ある時点で閉じたことにしない',
    ).toBe(0);
  });

  it('期間より前に作られた課題も、開いている数に入る', () => {
    const series = flowSeries([issue({ created_at: iso(NOW - 90 * DAY_MS) })], NOW);

    expect(series.open[0]).toBe(1);
  });
});
