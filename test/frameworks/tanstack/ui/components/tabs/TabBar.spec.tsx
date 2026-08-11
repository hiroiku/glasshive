import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabBar, type TabBarProps } from '~/frameworks/tanstack/ui/components/tabs/TabBar.tsx';

/* タブ行は、ピン留めと観測の 2 つを突き合わせて並ぶ。

   **突き合わせる相手がまだ来ていないことと、突き合わせて見つからなかったことは別である。**
   潰すと、木を待っているだけのタブが「もう無いタブ」として落ち、ピン留めしたプロジェクトを
   直に開いたユーザーには、自分がどこに居るのかが画面のどこにも出なくなる。
   ここで見るのはその境目である。 */

/* ルーターは本物を要らない。ここで見たいのは何が並ぶかだけで、
   押した先へ実際に移ることではない。 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    title,
    className,
  }: {
    children: React.ReactNode;
    title?: string;
    className?: string;
  }) => (
    <a href="/" title={title} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('~/frameworks/tanstack/ui/hooks/useHydrated.ts', () => ({ useHydrated: () => true }));
vi.mock('~/frameworks/tanstack/ui/hooks/useCommandMark.ts', () => ({ useCommandMark: () => '^' }));

type ProjectJson = NonNullable<TabBarProps['projects']>[number];

const NOW = Date.parse('2026-08-09T12:00:00Z');

const project = (id: string, name: string): ProjectJson => ({
  id,
  slug: id,
  name,
  path: `/w/${name}`,
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [
    {
      id: 's1',
      file: `/x/${id}.jsonl`,
      title: null,
      state: 'active',
      awaiting: null,
      started: new Date(NOW).toISOString(),
      last_activity: new Date(NOW).toISOString(),
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
      size: 0,
      sources: { state: 'observed', reason: null },
      subagents: [],
    },
  ],
});

/* タブは「一覧へ戻る」から始まってピン留めの順に続き、暫定タブが末尾に付く。
   先頭は必ず一覧なので、ピン留めのタブを見るときは 1 つ飛ばす。 */
function draw(props: Partial<TabBarProps> = {}) {
  const { container } = render(
    <TabBar
      visible={['-w-alpha']}
      pinned={['-w-alpha']}
      projects={[project('-w-alpha', 'alpha')]}
      onUnpin={() => undefined}
      onPin={() => undefined}
      onMove={() => undefined}
      current={null}
      showAll={false}
      {...props}
    />,
  );
  const read = (seat: Element | null) => ({
    name: seat?.querySelector('.tab-link > span:last-child')?.textContent ?? null,
    dot: seat?.querySelector('.dot')?.className ?? null,
    count: seat?.querySelector('.tab-slot .n')?.textContent ?? null,
    countClass: seat?.querySelector('.tab-slot .n')?.className ?? null,
  });
  const seats = [...container.querySelectorAll('.tab')];
  return {
    container,
    seatCount: seats.length,
    pinned: read(seats[1] ?? null),
    provisional: read(container.querySelector('.tab.provisional')),
  };
}

describe('ピン留めのタブと、まだ届いていない木', () => {
  it('木が届いていれば、プロジェクトの名前と状態の点を出す', () => {
    const { pinned } = draw();

    expect(pinned.name).toBe('alpha');
    expect(pinned.dot).toContain('active');
    expect(pinned.count, '数は観測から出る').toBe('1');
  });

  /* ここが本題。`preferences.json` は先に届き、木は後から届く。 */
  it('木がまだ届いていない間も、タブは id を名前として出す', () => {
    const { pinned } = draw({ projects: undefined });

    expect(
      pinned.name,
      'id は観測ではなくルートが持つ情報。落とすと、いまどこに居るかが画面から消える',
    ).toBe('-w-alpha');
    expect(pinned.dot, 'まだ観ていない状態を出さない。場所だけ取る').toContain('unknown');
    expect(pinned.count, '数はまだ言えない').toBe('');
  });

  it('木が届いた上で見つからない id は、タブごと落とす', () => {
    const { seatCount } = draw({ projects: [project('-w-beta', 'beta')] });

    expect(
      seatCount,
      '一覧へ戻るタブだけが残る。観測から消えたものは、待っているのではなくもう無い',
    ).toBe(1);
  });

  /* タブは畳まれていて中が見えない。人待ちであることは点だけでなく件数の色でも言う。 */
  it('人の入力を待っているプロジェクトは、件数にもその色を持たせる', () => {
    const awaiting = project('-w-alpha', 'alpha');
    const first = awaiting.sessions[0];
    if (first === undefined) throw new Error('セッションが無い');
    first.awaiting = 'user';

    const { pinned } = draw({ projects: [awaiting] });

    expect(pinned.dot).toContain('input');
    expect(pinned.countClass, '点 1 つだけだと、隣のタブの点に紛れる').toContain('input');
  });

  it('人待ちでないプロジェクトの件数には、その色を付けない', () => {
    expect(draw().pinned.countClass).toBe('n');
  });

  it('ピン留めしていないプロジェクトを観ている間は、末尾に暫定タブが出る', () => {
    const { provisional } = draw({ visible: [], projects: undefined, current: '-w-gamma' });

    expect(provisional.name).toBe('-w-gamma');
    expect(provisional.dot, '暫定タブでも、点の場所は同じだけ取る').toContain('unknown');
  });
});

/* 掴んで並べ替える。**押しただけと掴んだのを分ける** —— タブは押して開くものでもあるので、
   少しでも動いたら掴んだことにすると、開くつもりの押下が並べ替えになる。 */
describe('タブを掴んで並べ替える', () => {
  const three = {
    visible: ['-w-a', '-w-b', '-w-c'],
    pinned: ['-w-a', '-w-b', '-w-c'],
    projects: [project('-w-a', 'a'), project('-w-b', 'b'), project('-w-c', 'c')],
  };

  const seatsOf = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>('.tab[data-pin]'),
  ];

  /* happy-dom は寸法を持たないので、掴んだ先を決める矩形はこちらで与える。
     ここで確かめたいのは「どこで放したらどの位置になるか」であって、寸法の測り方ではない。 */
  const widths = (container: HTMLElement) => {
    seatsOf(container).forEach((seat, index) => {
      seat.getBoundingClientRect = () =>
        ({ left: index * 100, right: index * 100 + 100, width: 100 }) as DOMRect;
    });
  };

  it('放した場所の位置へ動かす', () => {
    const onMove = vi.fn();
    const { container } = render(
      <TabBar
        {...three}
        onUnpin={() => undefined}
        onPin={() => undefined}
        onMove={onMove}
        current={null}
        showAll={false}
      />,
    );
    widths(container);
    const first = seatsOf(container)[0];
    if (first === undefined) throw new Error('タブが無い');

    fireEvent.mouseDown(first, { button: 0, clientX: 10 });
    fireEvent.mouseMove(document, { clientX: 260 });
    fireEvent.mouseUp(document);

    expect(onMove, '掴んだものを抜いた後の位置で言う').toHaveBeenCalledWith('-w-a', 2);
  });

  it('動かさずに放したら、並べ替えない', () => {
    const onMove = vi.fn();
    const { container } = render(
      <TabBar
        {...three}
        onUnpin={() => undefined}
        onPin={() => undefined}
        onMove={onMove}
        current={null}
        showAll={false}
      />,
    );
    widths(container);
    const first = seatsOf(container)[0];
    if (first === undefined) throw new Error('タブが無い');

    fireEvent.mouseDown(first, { button: 0, clientX: 10 });
    fireEvent.mouseMove(document, { clientX: 12 });
    fireEvent.mouseUp(document);

    expect(
      onMove,
      '押しただけの操作がタブを動かすと、開くつもりが並べ替えになる',
    ).not.toHaveBeenCalled();
  });
});

describe('暫定タブを留める', () => {
  it('二度押しで留める', () => {
    const onPin = vi.fn();
    const { container } = render(
      <TabBar
        visible={[]}
        pinned={[]}
        projects={[project('-w-gamma', 'gamma')]}
        onUnpin={() => undefined}
        onPin={onPin}
        onMove={() => undefined}
        current="-w-gamma"
        showAll={false}
      />,
    );
    const seat = container.querySelector('.tab.provisional');
    if (seat === null) throw new Error('暫定タブが無い');

    fireEvent.doubleClick(seat);

    expect(onPin).toHaveBeenCalledWith('-w-gamma');
  });

  it('一度押しでは留めない', () => {
    const onPin = vi.fn();
    const { container } = render(
      <TabBar
        visible={[]}
        pinned={[]}
        projects={[project('-w-gamma', 'gamma')]}
        onUnpin={() => undefined}
        onPin={onPin}
        onMove={() => undefined}
        current="-w-gamma"
        showAll={false}
      />,
    );
    const seat = container.querySelector('.tab.provisional');
    if (seat === null) throw new Error('暫定タブが無い');

    fireEvent.click(seat);

    expect(onPin, '観ただけのプロジェクトがタブに残り続ける').not.toHaveBeenCalled();
  });
});
