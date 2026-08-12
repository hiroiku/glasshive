import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  IssueDiscussion,
  type IssueDiscussionProps,
} from '~/frameworks/tanstack/ui/components/panels/IssueDiscussion.tsx';

/* 課題 1 件のやり取りの画面。

   確かめるのは 4 つ —— コメントは本文が読める形で出るか、イベントは誰が起こしたのかを
   言うか、**何も言われていない課題と読めなかった課題が別の画面になるか**、そして
   参照が押せるか。空の一覧を 3 通りの意味で使っているので、そこが潰れると、静かな課題が
   観測できなかった課題として画面に出る。 */

const nav = vi.hoisted(() => ({ openIssue: vi.fn(), gotoIssues: vi.fn() }));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({ useNav: () => nav }));

/* 語のインデックスは空にする。ここで確かめたいのは本文が描かれることで、その中の語が
   チップになるかは `MdView` のテストが見ている。 */
vi.mock('~/frameworks/tanstack/ui/hooks/useTokenIndex.ts', async () => {
  const { tokenDict } = await import('~/frameworks/tanstack/ui/derive/tokens.ts');
  return { useTokenIndex: () => tokenDict(new Map(), new Map(), new Map(), new Map()) };
});

/* 形は画面のものをそのまま借りる。写して持つと、外へ出す形が変わったときに
   ここだけ古いまま緑になる。 */
type Discussion = NonNullable<IssueDiscussionProps['answer']>;
type Entries = Discussion['entries'];

/** 名指された人。顔を引けたかどうかは `avatar` が持つ —— 引けない人は `null` になる */
const who = (login: string, face = true) => ({ login, avatar: face ? login : null });

const NOW = Date.parse('2026-08-11T12:00:00Z');
const AT = '2026-08-11T11:00:00Z';

const answered = (entries: Entries, truncated = false): Discussion => ({
  state: 'observed',
  reason: null,
  entries,
  truncated,
  walked: true,
});

/** 届いている途中のやり取り。歩き終えていないので、下に続きの行が残る */
const arriving = (entries: Entries): Discussion => ({ ...answered(entries), walked: false });

const view = (answer: Discussion | undefined, pending = false, failed = false) =>
  render(
    <IssueDiscussion
      answer={answer}
      failed={failed}
      pending={pending}
      project={undefined}
      nowMs={NOW}
      url="https://github.com/north_harbor/atlas-api/issues/107"
    />,
  ).container;

describe('課題のやり取り', () => {
  it('コメントは本文を markdown として描く', () => {
    const container = view(
      answered([
        { kind: 'comment', at: AT, actor: who('rin_sato'), body: 'Fixed in **the parser**' },
      ]),
    );

    expect(container.querySelector('.cmt .md strong')?.textContent).toBe('the parser');
  });

  it('コメントは書いた人と、いつかを出す', () => {
    const container = view(
      answered([{ kind: 'comment', at: AT, actor: who('rin_sato'), body: 'looks right' }]),
    );

    expect(container.querySelector('.cmt-h')?.textContent).toContain('rin_sato');
    expect(container.querySelector('.cmt-h')?.textContent).toContain('1h ago');
  });

  /* 本文の無いコメントと、本文を読めなかったコメントを同じ空白にすると、
     読めなかったことが画面から消える。 */
  it('本文の無いコメントは黙り、読めなかったコメントはそう言う', () => {
    const empty = view(answered([{ kind: 'comment', at: AT, actor: who('rin_sato'), body: '' }]));
    expect(empty.querySelector('.cmt')?.textContent).not.toContain('did not come back');

    const unread = view(
      answered([{ kind: 'comment', at: AT, actor: who('rin_sato'), body: null }]),
    );
    expect(unread.querySelector('.cmt')?.textContent).toContain('did not come back');
  });

  it('イベントは起こした人を出す', () => {
    const container = view(
      answered([
        {
          kind: 'labeled',
          at: AT,
          actor: who('mei_kudo'),
          label: { name: 'bug', color: 'd73a4a' },
        },
      ]),
    );

    const event = container.querySelector('.disc-ev');
    expect(event?.textContent).toContain('mei_kudo');
    expect(event?.textContent).toContain('bug');
  });

  it('`login` を読めなかったイベントに、誰かの名前を当てない', () => {
    const container = view(answered([{ kind: 'reopened', at: AT, actor: null }]));

    expect(container.querySelector('.disc-ev')?.textContent).toContain('unknown');
  });

  it('コメントとイベントは、同じ姿では出さない', () => {
    const container = view(
      answered([
        { kind: 'comment', at: AT, actor: who('rin_sato'), body: 'on it' },
        { kind: 'closed', at: AT, actor: who('rin_sato'), reason: 'COMPLETED' },
      ]),
    );

    expect(container.querySelectorAll('.cmt')).toHaveLength(1);
    expect(container.querySelectorAll('.disc-ev')).toHaveLength(1);
  });

  it('GitHub が返した順のまま並べる', () => {
    const container = view(
      answered([
        { kind: 'comment', at: AT, actor: who('rin_sato'), body: 'first' },
        { kind: 'comment', at: '2026-08-11T11:30:00Z', actor: who('mei_kudo'), body: 'second' },
      ]),
    );

    const texts = [...container.querySelectorAll('.cmt .md')].map((node) =>
      node.textContent?.trim(),
    );
    expect(texts).toEqual(['first', 'second']);
  });

  it('課題を名指すイベントは、押せるチップになる', () => {
    const container = view(
      answered([
        {
          kind: 'cross-referenced',
          at: AT,
          actor: who('rin_sato'),
          source: { number: 26, title: 'Rewrite the parser' },
          will_close_target: true,
        },
      ]),
    );

    const chip = container.querySelector<HTMLElement>('.disc-ev .ichip');
    expect(chip?.textContent).toContain('#26');

    fireEvent.click(chip as HTMLElement);
    expect(nav.openIssue).toHaveBeenCalledWith('#26');
  });

  it('堰き止めた相手も、重複の相手も、親も同じように押せる', () => {
    const container = view(
      answered([
        {
          kind: 'blocked-by-added',
          at: AT,
          actor: who('rin_sato'),
          blocking_issue: { number: 12, title: null },
        },
        {
          kind: 'marked-as-duplicate',
          at: AT,
          actor: who('rin_sato'),
          canonical: { number: 34, title: null },
        },
        {
          kind: 'parent-added',
          at: AT,
          actor: who('rin_sato'),
          parent: { number: 56, title: null },
        },
      ]),
    );

    const chips = [...container.querySelectorAll('.disc-ev .ichip')].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(['#12', '#34', '#56']);
  });

  /* ここが潰れると、静かな課題が観測できなかった課題として画面に出る。 */
  it('何も言われていない課題は、静かに何も無いと言う', () => {
    const container = view(answered([]));

    expect(container.querySelector('.disc-quiet')).not.toBeNull();
    expect(container.querySelector('.not-observed'), '読めなかった板は出さない').toBeNull();
  });

  it('観測できなかったやり取りは `NotObserved` を出す', () => {
    const container = view({
      state: 'unobservable',
      reason: 'tracker.timeout',
      entries: [],
      truncated: false,
      walked: true,
    });

    expect(container.querySelector('.not-observed')).not.toBeNull();
    expect(container.querySelector('.disc-quiet'), '静かな課題の画面は出さない').toBeNull();
    expect(container.querySelector('.no-code')?.textContent).toBe('tracker.timeout');
  });

  /* 取りに行けなかったのは、`gh` が答えなかったのとは別の失敗である。**答えの中に理由が
     無い** —— それでも読めなかったことは言う。 */
  it('呼び出しが届かなかったときも `NotObserved` を出す', () => {
    const container = view(undefined, false, true);

    expect(container.querySelector('.not-observed')).not.toBeNull();
    expect(container.querySelector('.disc-quiet'), '静かな課題の画面は出さない').toBeNull();
  });

  /* 「その番号が無かった」と「読みに行けなかった」を同じ文言にすると、
     `gh` が答えたのかどうかが画面から消える。 */
  it('その番号が無かったことと、読めなかったことを別の文言で言う', () => {
    const absent = view({
      state: 'absent',
      reason: 'empty',
      entries: [],
      truncated: false,
      walked: true,
    });
    const unobservable = view({
      state: 'unobservable',
      reason: 'tracker.timeout',
      entries: [],
      truncated: false,
      walked: true,
    });

    const title = (container: HTMLElement) => container.querySelector('.no-title')?.textContent;
    expect(title(absent)).not.toBe(title(unobservable));
  });

  /* 尋ねている最中に空の一覧を出すと、これから届くやり取りが「無かった」ことになる。
   **何も出さないのも同じことである** —— 静かな課題と、まだ届いていない課題が同じ絵になる。 */
  it('尋ねている最中は、読んでいることを言う', () => {
    const container = view(undefined, true);

    expect(
      container.querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
      '読み上げの側にも、読んでいる最中であることを渡す',
    ).toBe('Reading the discussion');
    expect(
      container.textContent,
      '「まだ何も言われていない」と言えるのは、読み終えた課題だけである',
    ).not.toContain('Nothing has been said');
    expect(
      container.querySelector('.no-title'),
      'まだ答えが返っていないだけで、読めなかったのではない',
    ).toBe(null);
  });

  /* 届く中身の場所は先に取っておく。**取らないと、届いた瞬間に下の中身が押し下げられる** ——
     読んでいた行が視界から飛ぶうえ、そこに何も無かったのが在ったことに変わって見える。 */
  it('尋ねている最中も、中身の来る場所を取っておく', () => {
    const container = view(undefined, true);

    expect(container.querySelectorAll('.rl-line').length).toBeGreaterThan(0);
  });

  it('読み切っていないことを黙らない', () => {
    const container = view(
      answered([{ kind: 'comment', at: AT, actor: who('rin_sato'), body: 'first' }], true),
    );

    expect(container.querySelector('.disc-cut')).not.toBeNull();
  });
});

/* やり取りを時刻の並びとして読ませる。**線の上に点が要る** —— 点が無いと、項目は罫線を
   共有しているだけの引用の並びに見える。そして名指された人には、いつも顔を出す。 */
describe('タイムラインとして読ませる', () => {
  it('項目ごとに、線の上へ点を置く', () => {
    const container = view(
      answered([
        { kind: 'comment', at: AT, actor: who('rin_sato'), body: 'ひとこと' },
        { kind: 'reopened', at: AT, actor: who('octocat') },
      ]),
    );

    expect(
      container.querySelectorAll('.disc .disc-dot').length,
      '点が無いと、項目は時刻の並びとして読めない',
    ).toBe(2);
  });

  /* 顔を出すのはコメントだけではない。**13 種類のイベントもどれも人を名指している** ——
     名指しているのに顔が出ないと、コメントだけが人の発言で、他は機械の記録に見える。 */
  it('イベントの行にも、名指された人の顔を出す', () => {
    const container = view(
      answered([
        { kind: 'labeled', at: AT, actor: who('rin_sato'), label: { name: 'ui', color: null } },
      ]),
    );
    const face = container.querySelector('.disc-ev .disc-who .av');

    expect(face?.getAttribute('aria-label'), '顔は誰の顔かを持つ').toBe('rin_sato');
    expect(
      face?.getAttribute('aria-hidden'),
      '名前がすぐ隣に文字で並んでいるので、顔は名乗らせない',
    ).toBe('true');
    expect(
      face?.querySelector('img')?.getAttribute('src'),
      '顔は同じ origin から引く。GitHub の CDN を直に指さない',
    ).toBe('/api/avatar/rin_sato');
  });

  /* 担当にされた人も名指された 1 人である。**起こした人だけに顔を出すと、誰が誰を担当に
     したのかが片方だけ顔で、片方だけ文字になる。** */
  it('担当にされた人にも顔を出す', () => {
    const container = view(
      answered([{ kind: 'assigned', at: AT, actor: who('rin_sato'), assignee: who('octocat') }]),
    );
    const faces = [...container.querySelectorAll('.disc-ev .av')].map((node) =>
      node.getAttribute('aria-label'),
    );

    expect(faces).toEqual(['rin_sato', 'octocat']);
  });

  /* **顔を引けないことと、誰も名指されていないことは別である。** 前者は頭文字の `.av` が
     残り、後者は `.av` そのものが出ない。同じ絵にすると、読めなかったことが誰かの不在に
     化ける。 */
  it('顔を引けない人と、名指されていない項目を分ける', () => {
    const container = view(
      answered([
        { kind: 'reopened', at: AT, actor: who('faceless', false) },
        { kind: 'closed', at: AT, actor: null, reason: null },
      ]),
    );
    const [withoutFace, withoutActor] = [...container.querySelectorAll('.disc-ev')];

    expect(
      withoutFace?.querySelector('.av')?.textContent,
      '顔を引けない人にも、誰なのかは残る',
    ).toBe('FA');
    expect(withoutFace?.querySelector('.av img'), '引けない顔の画像を求めに行かない').toBe(null);
    expect(
      withoutActor?.querySelector('.av'),
      '名指されていない項目に顔を置くと、居ない人が居ることになる',
    ).toBe(null);
    expect(withoutActor?.querySelector('.dimtxt')?.textContent).toBe('unknown');
  });
});

/* アイコンの色。**沈めた行の中で、閉じた・開き直った・進めなくなった行だけが目に入る**
   —— 何十件も並ぶラベルの付け外しの中から、その 3 つを探すのがこの色である。 */
describe('イベントのアイコンの色', () => {
  const toneOf = (entries: Entries) =>
    [...view(answered(entries)).querySelectorAll('.disc-ico')].map((node) =>
      node.getAttribute('class'),
    );

  const by = (login: string) => ({ at: AT, actor: who(login) });

  it('閉じた・開き直した・堰き止めた行は、一覧がその状態に使う色になる', () => {
    expect(
      toneOf([
        { kind: 'closed', ...by('rin_sato'), reason: null },
        { kind: 'reopened', ...by('rin_sato') },
        { kind: 'blocked-by-added', ...by('rin_sato'), blocking_issue: { number: 9, title: null } },
      ]),
    ).toEqual(['mdi disc-ico st-closed', 'mdi disc-ico st-open', 'mdi disc-ico st-blocked']);
  });

  /* 「やり終えた」と「やらないことにした」を同じ色にすると、閉じた理由が色から消える。
     `reason` は GitHub の綴りのまま届く。**一覧の状態を組み立てる `statusOf` と同じく、
     綴りの大小では分けない** —— 分けると、同じ理由の課題が一覧と違う色で出る。 */
  it.each(['NOT_PLANNED', 'not_planned'])('%s で閉じた行は、閉じた行と色が違う', (reason) => {
    expect(toneOf([{ kind: 'closed', ...by('rin_sato'), reason }])).toEqual([
      'mdi disc-ico st-not_planned',
    ]);
  });

  /* やらないことにした以外の理由は、一覧では closed に落ちる。ここもそれに揃える */
  it.each(['COMPLETED', 'DUPLICATE'])('%s で閉じた行は、閉じた色になる', (reason) => {
    expect(toneOf([{ kind: 'closed', ...by('rin_sato'), reason }])).toEqual([
      'mdi disc-ico st-closed',
    ]);
  });

  it('マイルストーンを付け外しした行は、マイルストーンの色になる', () => {
    expect(
      toneOf([
        { kind: 'milestoned', ...by('rin_sato'), milestone_title: '2.0.0' },
        { kind: 'demilestoned', ...by('rin_sato'), milestone_title: '2.0.0' },
      ]),
    ).toEqual(['mdi disc-ico ev-ms', 'mdi disc-ico ev-ms']);
  });

  /* **色が付いていないことが、この行は何も閉じても堰き止めてもいないと言っている。**
     全部の行に色を配ると、色は種類の飾りになって、追うべき行を指さなくなる。
     残りの 8 種類を全部並べるのは、1 つ足したときにここが黙って通らないようにするためである。 */
  it('残りの行には、どれも色を付けない', () => {
    const label = { name: 'ui', color: null };
    const reference = { number: 9, title: null };

    expect(
      toneOf([
        { kind: 'labeled', ...by('rin_sato'), label },
        { kind: 'unlabeled', ...by('rin_sato'), label },
        { kind: 'assigned', ...by('rin_sato'), assignee: who('octocat') },
        { kind: 'unassigned', ...by('rin_sato'), assignee: who('octocat') },
        { kind: 'renamed', ...by('rin_sato'), previous_title: 'old', current_title: 'new' },
        { kind: 'parent-added', ...by('rin_sato'), parent: reference },
        { kind: 'marked-as-duplicate', ...by('rin_sato'), canonical: reference },
        {
          kind: 'cross-referenced',
          ...by('rin_sato'),
          source: reference,
          will_close_target: false,
        },
      ]),
    ).toEqual(Array.from({ length: 8 }, () => 'mdi disc-ico'));
  });
});

/* やり取りはページごとに届く。**届いたぶんから描く** —— 何百も続いた課題の最初の 10 件を、
   5 ページぶんの往復が終わるまで隠しておく理由が無い。

   ここで見るのは、届いた発言がその場で出ることと、まだ続きが在ることを黙らないことと、
   1 枚も届いていないうちを静かな課題にしないことである。 */
describe('ページが届いている途中', () => {
  const said = (body: string) => ({
    kind: 'comment' as const,
    at: AT,
    actor: who('rin_sato'),
    body,
  });

  it('届いた発言は、読み終える前に出す', () => {
    const container = view(arriving([said('first')]));

    expect(
      container.querySelector('.disc')?.textContent,
      '届いた発言を隠して待たせると、ページ 1 の 100 件が読み終えるまで無いことになる',
    ).toContain('first');
  });

  /* 発言の下で画面が止まって見えると、そこがやり取りの終わりとして読める。**続きの来る場所を
     取っておく** —— 取らないと、届いた瞬間に読んでいた行が押し下げられる。 */
  it('続きが在ることを、発言の下で言う', () => {
    const arrivingView = view(arriving([said('first')]));
    const done = view(answered([said('first')]));

    expect(
      arrivingView.querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
      '続きが在ることを黙ると、途中の並びが全部として読める',
    ).toBe('Reading more of the discussion');
    expect(
      done.querySelector('[role="progressbar"]'),
      '読み終えた並びの下に、続きを待つ行が残る',
    ).toBeNull();
  });

  /* **1 枚も届いていないうちを、静かな課題にしない。** どちらも発言の無い画面になるが、
     片方は「まだ誰も書いていない」で、もう片方は「まだ届いていない」である。 */
  it('1 枚も届いていないうちは、静かな課題にしない', () => {
    const container = view(arriving([]));

    expect(
      container.textContent,
      '「まだ何も言われていない」と言えるのは、読み終えた課題だけである',
    ).not.toContain('Nothing has been said');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'Reading the discussion',
    );
  });

  /* 尋ねてもいない `absent` は「この番号のやり取りは無かった」ではない。**歩き終える前の
     `absent` を、その番号が無かったことにしない。** */
  it('尋ねる前の `absent` を、その番号が無かったことにしない', () => {
    const container = view({
      state: 'absent',
      reason: 'no-source',
      entries: [],
      truncated: false,
      walked: false,
    });

    expect(
      container.querySelector('.no-title'),
      '尋ねる前から「GitHub にその番号は無い」と言うことになる',
    ).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  /* 読めなかったことは最初の 1 枚で決まっている。**歩き終えるのを待たない** ——
     待つと、読めなかった画面が一瞬だけ読み込み中の顔になる。 */
  it('読めなかったことは、歩き終えるのを待たずに言う', () => {
    const container = view({
      state: 'unobservable',
      reason: 'tracker.timeout',
      entries: [],
      truncated: false,
      walked: false,
    });

    expect(container.querySelector('.no-code')?.textContent).toBe('tracker.timeout');
  });

  /* 上限に当たったかが分かるのは読み終えたときである。**読んでいる途中に言わない** ——
     まだ届いていない発言が「上限で切った先」として画面から消える。 */
  it('切った先が在ることは、読み終えてから言う', () => {
    const container = view({ ...arriving([said('first')]), truncated: true });

    expect(
      container.querySelector('.disc-cut'),
      '読んでいる途中の並びを、切り詰めたものとして出す',
    ).toBeNull();
  });
});
