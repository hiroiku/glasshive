import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '~/frameworks/tanstack/ui/styles/index.css';
import {
  IssuesTable,
  type IssuesTableProps,
} from '~/frameworks/tanstack/ui/components/issues/IssuesTable.tsx';
import type { EventLog } from '~/frameworks/tanstack/ui/derive/issueEvents.ts';
import { MONTH_MS } from '~/frameworks/tanstack/ui/derive/issueGantt.ts';
import { buildWorkJoin } from '~/frameworks/tanstack/ui/derive/workJoin.ts';
import { differsAfter, paintedBy, suppress } from './paint.ts';

/* トラックの上で観測を語る規則が、実際に何を塗るか。

   ここに並ぶ規則は、どれも `Observation` の主張そのものである —— ハッチは「ここは読んで
   いない」、破線のフラグは「この時刻は代用である」、点線は「まだ読んでいる最中である」。
   **効かなくなった規則は画面を鈍らせるのではなく、観測と逆のことを言わせる。**

   `getComputedStyle` で終わりにしない。`mask-image` に消された `::after` は
   `display: block` と `width: 2px` を答え続けるので、DOM も computed style も在ると言う。
   撮って画素を数えるところまでやって、初めて確かめたことになる。 */

vi.mock('~/frameworks/tanstack/ui/components/text/SubjectText.tsx', () => ({
  SubjectText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({
    openConv: vi.fn(),
    openIssue: vi.fn(),
    openRef: vi.fn(),
    gotoBranch: vi.fn(),
    gotoIssues: vi.fn(),
    closePanel: vi.fn(),
  }),
}));

type Issue = IssuesTableProps['issues'][number];

const NOW = Date.parse('2026-08-09T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: `title ${id}`,
  status: 'open',
  issue_type: null,
  labels: [],
  assignee: null,
  created_at: iso(20),
  updated_at: iso(1),
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
});

const readLog = (
  entries: readonly { id: string; at?: number[]; truncated?: boolean }[],
): EventLog => ({
  kind: 'observed',
  complete: true,
  byId: new Map(
    entries.map((entry) => [
      entry.id,
      {
        id: entry.id,
        events: (entry.at ?? []).map((daysAgo) => ({ at: iso(daysAgo), kind: 'comment' })),
        truncated: entry.truncated ?? false,
      },
    ]),
  ),
});

/* 一覧をそのまま描く。**手で組んだ HTML に置き換えない** —— 規則が当たるかどうかは祖先の
   並びとカスケードで決まるので、画面が作る形の外で測っても、その形については何も言えない。 */
function drawTrack(issues: readonly Issue[], eventLog: EventLog): HTMLElement {
  const { container } = render(
    <IssuesTable
      issues={issues}
      all={issues}
      project={undefined}
      workers={new Map()}
      join={buildWorkJoin(null, 'observed', issues)}
      query=""
      onQuery={vi.fn()}
      status={null}
      order={{ key: 'updated', direction: 'desc' }}
      onSort={vi.fn()}
      ganttWindow={MONTH_MS}
      eventLog={eventLog}
      group={undefined}
      nowMs={NOW}
      firstPaint
    />,
  );
  const track = container.querySelector<HTMLElement>('.issue-row:not(.head) .gt');
  if (track === null) throw new Error('トラックが無い');
  return track;
}

const child = (track: HTMLElement, selector: string): HTMLElement => {
  const found = track.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`${selector} が行に無い`);
  return found;
};

/** 読み残しの在る行。`created_at` を読めていないので、左端はぼかす側になる */
const cutTrack = () =>
  drawTrack(
    [issue('#1', { created_at: null })],
    readLog([{ id: '#1', at: [10], truncated: true }]),
  );

describe('測る土台が、測れる状態に在る', () => {
  it('トラックには幅と高さが在る', () => {
    const box = drawTrack([issue('#1')], readLog([{ id: '#1', at: [10] }])).getBoundingClientRect();

    expect(box.width, 'ここが 0 なら、以降の測りは全部 0 を返して緑になる').toBeGreaterThan(20);
    expect(box.height).toBeGreaterThan(4);
  });

  it('本物の見た目の決まりが届いている', () => {
    const track = drawTrack([issue('#1')], readLog([{ id: '#1', at: [10] }]));

    expect(
      getComputedStyle(track).position,
      '`index.css` が届いていないと、以降は素の HTML を測ることになる',
    ).toBe('relative');
  });
});

/* 読み残しの区間。**細い区間でこそ効かないと困る** —— 読み残しが 1 日ぶんの行が、読み終えた
   行と同じ絵になる。端をぼかす `mask-image` を要素そのものに掛けると、区間が細いほど強く
   効き、切れ目を言う線ごと持っていく。 */
describe('読み残しの区間は、細くても消えない', () => {
  /* ハッチだけを測る。**切れ目の線を止めておく** —— 同じ要素の `::after` が濃く、要素ごと
     測るとインクの 9 割をそちらが出すので、ハッチを丸ごと消しても測りは 1 割しか動かない。
     線そのものは、下の「幅 0 の区間でも」が別に見ている。 */
  const hatchOnly = () => suppress('.gt-cut::after { content: none }');

  const inkOf = async (width: number, soft: boolean) => {
    const track = cutTrack();
    const cut = child(track, '.gt-cut');
    cut.style.left = '20%';
    cut.style.width = `${width}%`;
    cut.classList.toggle('soft-from', soft);
    return (await paintedBy(cut, track)).ink;
  };

  it.each([0.6, 1.2, 3, 6])('幅 %s パーセントでも、ハッチそのものが塗られている', async (width) => {
    const stop = hatchOnly();
    try {
      expect(
        await inkOf(width, false),
        '読み残しの在る行が、読み終えた行と同じ絵になっている',
      ).toBeGreaterThan(60);
    } finally {
      stop();
    }
  });

  /* 硬い端は観測した時刻、ぼかした端は「分からない」である。**同じ絵になった時点で、
     観測していない端が観測した端として画面に出る。** */
  it.each([0.6, 1.2, 3, 6])(
    '幅 %s パーセントでも、ぼかした端は硬い端と別の絵になる',
    async (width) => {
      const stop = hatchOnly();
      try {
        const soft = await inkOf(width, true);
        const hard = await inkOf(width, false);

        expect(soft / hard, 'ぼかしが効いていない。両端が同じことを言っている').toBeLessThan(0.9);
        expect(
          soft / hard,
          'ぼかしが区間を消している。読み残しが読み終えたことになる',
        ).toBeGreaterThan(0.15);
      } finally {
        stop();
      }
    },
  );

  /* 記録の始まりを言う線。**幅が 0 でも残る** —— 切れ目がどこかを言うのはこの線であって、
     ハッチの広さではない。読み残しが 1 日の行と 1 か月の行が、同じことを言う。 */
  it('幅 0 の区間でも、切れ目の線は塗る', async () => {
    const track = cutTrack();
    const cut = child(track, '.gt-cut');
    cut.style.left = '30%';
    cut.style.width = '0%';
    cut.classList.add('soft-from');

    const painted = await paintedBy(cut, track);

    expect(painted.strongest, '線が消えると、どこで切れたかが画面から無くなる').toBeGreaterThan(60);
  });
});

/* トラックの状態。**「読めなかった」と「無かった」を同じ絵にしない** —— 一方はハッチ、
   もう一方は空である。読んでいる最中はどちらでもない。 */
describe('読めていない行と、何も起きていない行は、別の絵になる', () => {
  const emptyTrack = () => drawTrack([issue('#1')], readLog([{ id: '#1' }]));

  it('読めなかった行はハッチで埋まる', async () => {
    const track = emptyTrack();

    const painted = await differsAfter(
      track,
      () => track.classList.add('unread'),
      () => track.classList.remove('unread'),
    );

    expect(
      painted.pixels,
      '空のままだと、読めなかった行が何も起きていない行になる',
    ).toBeGreaterThan(500);
  });

  it('読んでいる最中は、空でもハッチでもない', async () => {
    const track = emptyTrack();

    const reading = await differsAfter(
      track,
      () => track.classList.add('reading'),
      () => track.classList.remove('reading'),
    );
    track.classList.add('reading');
    const becomingUnread = await differsAfter(
      track,
      () => track.classList.replace('reading', 'unread'),
      () => track.classList.replace('unread', 'reading'),
    );

    expect(reading.pixels, '読み終えて何も無かった行と同じ絵になっている').toBeGreaterThan(40);
    expect(
      becomingUnread.pixels,
      '読んでいる最中と、読めなかったのが同じ絵になっている',
    ).toBeGreaterThan(500);
  });

  /* 記録そのものが無いのは `absent` である。**読めなかったのではないので、ハッチは出さない。**
     読んで何も無かった行と同じ絵になり、どちらの「無かった」かは `title` が言う。 */
  it('記録が無い行は、読んで何も無かった行と同じ絵である', async () => {
    const track = emptyTrack();

    const painted = await differsAfter(
      track,
      () => track.classList.add('nolog'),
      () => track.classList.remove('nolog'),
    );

    expect(painted.pixels, 'ハッチが出ると、無かったことが読めなかったことになる').toBe(0);
  });
});

/* 閉じた時刻のフラグ。`closed_at` を読めず `updated_at` で代用した時刻は、代用であることを
   線の引き方が言う。**同じ絵にすると、代用が観測した時刻として画面に出る。** */
describe('代用した閉じた時刻は、観測した時刻と別の絵になる', () => {
  const closedTrack = () =>
    drawTrack([issue('#1', { status: 'closed', closed_at: iso(4) })], readLog([{ id: '#1' }]));

  it('フラグそのものが塗られている', async () => {
    const track = closedTrack();

    const painted = await paintedBy(child(track, '.gt-flag'), track);

    expect(painted.strongest).toBeGreaterThan(60);
  });

  /* 撮るのはフラグ自身の箱だけである。`::before` まで入れると、旗の部分が変わるだけで差が
     出てしまい、縦棒が実線に戻っても気付けない。破線であることを言っているのは縦棒である。

     見るのは「違う」ではなく「隙間が在る」ほうである。**薄いだけの実線は、代用を観測した
     時刻と同じ形で描いている** —— 濃さが違うだけの線は、並べて見ないと違いが分からない。 */
  it('代用の時刻の縦棒には、実線に無い隙間が在る', async () => {
    const track = closedTrack();
    const flag = child(track, '.gt-flag');

    const solid = await paintedBy(flag, track, flag);
    flag.classList.add('approx');
    const dashed = await paintedBy(flag, track, flag);

    expect(dashed.pixels, '代用の時刻が、観測した時刻と同じ形で出ている').toBeLessThan(
      solid.pixels * 0.8,
    );
    expect(dashed.pixels, '縦棒そのものが消えている').toBeGreaterThan(0);
  });
});
