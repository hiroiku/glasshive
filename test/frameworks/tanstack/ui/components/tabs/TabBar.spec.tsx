import { render } from '@testing-library/react';
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
      actor: null,
      issues: [],
      current: null,
      intervals: [],
      intervals_complete: true,
      intervals_state: 'observed',
      size: 0,
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
      projects={[project('-w-alpha', 'alpha')]}
      onUnpin={() => undefined}
      current={null}
      showAll={false}
      {...props}
    />,
  );
  const read = (seat: Element | null) => ({
    name: seat?.querySelector('.tab-link > span:last-child')?.textContent ?? null,
    dot: seat?.querySelector('.dot')?.className ?? null,
    count: seat?.querySelector('.tab-slot .n')?.textContent ?? null,
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

  it('ピン留めしていないプロジェクトを観ている間は、末尾に暫定タブが出る', () => {
    const { provisional } = draw({ visible: [], projects: undefined, current: '-w-gamma' });

    expect(provisional.name).toBe('-w-gamma');
    expect(provisional.dot, '暫定タブでも、点の場所は同じだけ取る').toContain('unknown');
  });
});
