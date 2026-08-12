import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { AgentProcessIntegration } from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import type {
  TranscriptGroup,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createTranscriptDrafts } from '~/application/services/sessions/transcript-draft.service.ts';
import { createTranscriptIndex } from '~/application/services/sessions/transcript-index.service.ts';
import { createObserveTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* 何が並ぶかを、中身を読む前に決める 1 枚。

   ここで見るのは 2 つ。**索引は先頭と末尾しか開かない**こと(パスを引くだけの呼び出しが
   `~/.claude/projects` を全部読まなくなる、というのがこの分割の目的である)と、
   **行の識別が索引の時点で確定している**ことである。 */

const NOW = 1_700_000_000_000;
const ACTIVE_THRESHOLD_MS = 60_000;

const HEAD = `${JSON.stringify({ type: 'user', cwd: '/w/proj', timestamp: '2026-01-01T00:00:00Z' })}\n`;

function sourceOf(slug: string, name: string, subagents: readonly string[] = []): TranscriptGroup {
  return {
    slug,
    sessions: [
      {
        id: name,
        fileName: `${name}.jsonl`,
        file: `/nest/projects/${slug}/${name}.jsonl`,
        mtimeMs: NOW,
        sizeBytes: HEAD.length,
        subagents: subagents.map((child) => ({
          id: child,
          fileName: `${child}.jsonl`,
          file: `/nest/projects/${slug}/${name}/subagents/${child}.jsonl`,
          mtimeMs: NOW,
          sizeBytes: HEAD.length,
          meta: null,
          runId: null,
        })),
        subagentsWalked: observed(subagents.length),
      },
    ],
    walked: observed(1),
  };
}

/** ディレクトリが読めなかった slug。走査できていないので、セッションは 1 つも見えていない */
const unreadableOf = (slug: string): TranscriptGroup => ({
  slug,
  sessions: [],
  walked: unobservable(new UnexpectedError('開けない')),
});

/** slug ごとに別の作業ディレクトリを名乗らせる。渡さなければ、どの slug も同じ場所を指す */
const headOf = (cwd: string) =>
  `${JSON.stringify({ type: 'user', cwd, timestamp: '2026-01-01T00:00:00Z' })}\n`;

/** `/nest/projects/<slug>/…` の slug */
const slugOfFile = (file: string) => file.split('/')[3] ?? '';

/** 読みに行った範囲の大きさを控える偽のポート。**どこまで開いたかそのものが確かめたいこと** */
function spyRepository(groups: readonly TranscriptGroup[], cwdBySlug: Record<string, string> = {}) {
  const heads: number[] = [];
  const tails: number[] = [];
  const transcripts: TranscriptRepository = {
    async listTranscripts() {
      return observed(groups);
    },
    async statTranscript() {
      return observed({ mtimeMs: NOW, sizeBytes: HEAD.length });
    },
    async readHead(at, request) {
      heads.push(request.maxBytes);
      return observed({
        text: headOf(cwdBySlug[slugOfFile(at.file)] ?? '/w/proj'),
        complete: true,
      });
    },
    async readTail(_at, request) {
      tails.push(request.maxBytes);
      return observed({ text: '', complete: true });
    },
    async canonicalize(target) {
      return observed(target);
    },
  };
  return { transcripts, heads, tails };
}

interface SceneOptions {
  readonly processes?: AgentProcessIntegration;
  /* 観ると決めたディレクトリ。渡さなければ、偽のポートが名乗る場所 1 つを記録してある。
   **どのテストも自分で渡す** —— 記録していないディレクトリは深く読まれない。 */
  readonly watched?: readonly string[];
  /** 1 つ前の形から引き継いだ id。パスを持っていないので、名前として突き合わせる */
  readonly watchedSlugs?: readonly string[];
  /** 先に読むディレクトリ。名指されたリポジトリで、記録の全部とは限らない */
  readonly readFirst?: readonly string[];
  /** slug ごとの作業ディレクトリ。渡さなければ、どの slug も同じ場所を指す */
  readonly cwdBySlug?: Record<string, string>;
}

function sceneOf(groups: readonly TranscriptGroup[], options: SceneOptions = {}) {
  const spy = spyRepository(groups, options.cwdBySlug);
  const drafts = createTranscriptDrafts({
    transcripts: spy.transcripts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
  });
  const roots = options.watched ?? ['/w/proj'];
  const index = createTranscriptIndex({
    transcripts: spy.transcripts,
    processes: options.processes ?? { list: async () => observed([]) },
    drafts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
    clock: { now: () => NOW },
    ttlMs: 0,
    watched: async () => ({ roots, worktrees: [], slugs: options.watchedSlugs ?? [] }),
  });
  return {
    ...spy,
    index,
    observe: createObserveTree({
      index,
      drafts,
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
      readFirst: async () => options.readFirst ?? roots,
    }),
  };
}

/** 木に並んだプロジェクトの id */
const treeIdsOf = async (scene: ReturnType<typeof sceneOf>) => {
  const tree = await scene.observe.execute(NOW);
  if (!tree.ok) throw tree.error;
  return tree.value.projects.map((project) => project.id);
};

const indexOf = async (scene: ReturnType<typeof sceneOf>) => {
  const snapshot = await scene.index.get();
  if (!snapshot.ok) throw snapshot.error;
  return snapshot.value;
};

describe('中身を読む前の索引', () => {
  it('`transcript` 1 本につき、先頭と末尾を 1 度ずつしか開かない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);

    expect(scene.heads, '作業ディレクトリは先頭に在る').toHaveLength(1);
    expect(scene.tails, '末尾は自分の番が終わっているかを見るためだけに開く').toHaveLength(1);
  });

  it('木より狭い範囲しか開かない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);
    const widestForIndex = Math.max(...scene.tails);

    await scene.observe.execute(NOW);
    const widestForTree = Math.max(...scene.tails);

    expect(
      widestForIndex,
      '稼働区間と消費のための読み取り範囲は、パスを引くのに要らない',
    ).toBeLessThan(widestForTree);
  });

  it('行の識別は、中身を読む前に確定している', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    const snapshot = await indexOf(scene);

    expect(snapshot.index.stubs).toHaveLength(1);
    expect(snapshot.index.stubs[0]?.id).toBe('a');
    expect(snapshot.index.stubs[0]?.canonicalPath).toBe('/w/proj');
    expect(snapshot.index.stubs[0]?.name).toBe('proj');
  });

  it('同じパスを指す slug は、索引の時点で 1 行に束ねてある', async () => {
    const scene = sceneOf([sourceOf('b', 'later'), sourceOf('a', 'earlier')]);

    const snapshot = await indexOf(scene);

    expect(snapshot.index.stubs, '束ねてから配らないと、行が後から併合して消える').toHaveLength(1);
    expect(snapshot.index.stubs[0]?.id, '代表は辞書順で決まる').toBe('a');
    expect(snapshot.index.stubs[0]?.slugs).toEqual(['a', 'b']);
  });

  it('`transcript` の数は、セッションと子を合わせて数える', async () => {
    const scene = sceneOf([sourceOf('a', 'session', ['agent-1', 'agent-2'])]);

    const snapshot = await indexOf(scene);

    expect(
      snapshot.index.stubs[0]?.transcriptCount,
      '読み終えた数の分母である。子を数え落とすと、分子が分母を追い越す',
    ).toBe(3);
  });

  it('ディレクトリを読めなかった slug も、行として並ぶ', async () => {
    const scene = sceneOf([sourceOf('a', 'session'), unreadableOf('-w-closed')]);

    const snapshot = await indexOf(scene);

    expect(
      snapshot.index.stubs.map((stub) => stub.id),
      '読めなかったことを「セッションが無かった」に倒すと、プロジェクトが一覧から黙って消える',
    ).toEqual(['a', '-w-closed']);
  });

  it('ディレクトリを読めなかった行は、`transcript` の数を数えられなかったことにする', async () => {
    const scene = sceneOf([sourceOf('a', 'session'), unreadableOf('-w-closed')]);

    const snapshot = await indexOf(scene);
    const closed = snapshot.index.stubs.find((stub) => stub.id === '-w-closed');

    expect(closed?.transcriptCount, '読める `transcript` が 1 本も見えていない').toBe(0);
    expect(
      closed?.walked.kind,
      '0 本という数だけでは、`transcript` が無い行と数えられなかった行が同じ形になる',
    ).toBe('unobservable');
    expect(
      snapshot.index.stubs.find((stub) => stub.id === 'a')?.walked,
      '走査できた行は、見えた `transcript` の数をそのまま持つ',
    ).toEqual(observed(1));
  });

  it('走査できなかったことは、プロジェクトが無いことと分けて持つ', async () => {
    const spy = spyRepository([]);
    const transcripts: TranscriptRepository = {
      ...spy.transcripts,
      async listTranscripts() {
        return unobservable(new UnexpectedError('走査できない'));
      },
    };
    const drafts = createTranscriptDrafts({ transcripts, activeThresholdMs: ACTIVE_THRESHOLD_MS });
    const index = createTranscriptIndex({
      transcripts,
      processes: { list: async () => observed([]) },
      drafts,
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
      clock: { now: () => NOW },
      ttlMs: 0,
    });

    const snapshot = await index.get();
    if (!snapshot.ok) throw snapshot.error;
    expect(snapshot.value.index.sources.kind).toBe('unobservable');
    expect(snapshot.value.index.stubs).toEqual([]);
  });
});

/* 索引のための読みが、本読みに足されないこと。 */
describe('索引と本読みの読み取り', () => {
  it('索引が開いた先頭と末尾を、木は開き直さない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);
    const headsAfterIndex = scene.heads.length;
    /* 索引が開いた末尾の幅。木がここを開き直すなら、同じ幅がもう一度並ぶ */
    const narrow = Math.max(...scene.tails);
    const narrowAfterIndex = scene.tails.filter((bytes) => bytes === narrow).length;

    const result = await scene.observe.execute(NOW);
    expect(result.ok).toBe(true);

    expect(
      scene.heads.length,
      '同じキーで覚えてあるので、索引のための読みは総量として足されない',
    ).toBe(headsAfterIndex);
    expect(
      scene.tails.filter((bytes) => bytes === narrow).length,
      '木が開き直すなら、索引を挟んだぶんだけ読む量が増えている',
    ).toBe(narrowAfterIndex);
  });

  it('木は、索引が開かなかった範囲を開く', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);
    const tailsAfterIndex = scene.tails.length;
    await scene.observe.execute(NOW);

    expect(scene.tails.length, '稼働区間と消費は、木を組むときに初めて読む').toBeGreaterThan(
      tailsAfterIndex,
    );
  });
});

/* 観ると決めたディレクトリ。

   走査するのは今までどおり `~/.claude/projects` の全部で、名前は全部が見える。変わるのは
   **どこを深く読むか** と、一覧に 1 行足りること、読む順である。 */
describe('記録したディレクトリ', () => {
  it('`transcript` が 1 本も無くても、一覧に居る', async () => {
    const scene = sceneOf([sourceOf('a', 'session')], { watched: ['/w/proj', '/w/fresh'] });

    const snapshot = await indexOf(scene);
    const named = snapshot.index.stubs.find((stub) => stub.canonicalPath === '/w/fresh');

    expect(named, '居なければ、そのディレクトリを開くことができない').toBeDefined();
    expect(named?.path, 'セッションが無ければ、パスは名指されたほうからしか来ない').toBe(
      '/w/fresh',
    );
    expect(named?.name).toBe('fresh');
    expect(named?.walked, '数え上げられなかったのではなく、0 本だと分かっている').toEqual(
      observed(0),
    );
  });

  it('すでに観測できているディレクトリを記録しても、行は増えない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')], { watched: ['/w/proj'] });

    const snapshot = await indexOf(scene);

    expect(
      snapshot.index.stubs,
      '同じ場所が 2 行に割れると、片方だけにセッションが並ぶ',
    ).toHaveLength(1);
    expect(snapshot.index.stubs[0]?.canonicalPath).toBe('/w/proj');
  });

  /* 走っている glasshive は、あとから別のディレクトリを伝えられる。**先に記録した相手が
     一覧から消えると、開いていたウィンドウの行が無くなる。** */
  it('記録したディレクトリは、増えても全部が一覧に居る', async () => {
    const scene = sceneOf([sourceOf('a', 'session')], {
      watched: ['/w/proj', '/w/fresh', '/w/later'],
    });

    const snapshot = await indexOf(scene);

    expect(snapshot.index.stubs.map((stub) => stub.canonicalPath).sort()).toEqual([
      '/w/fresh',
      '/w/later',
      '/w/proj',
    ]);
  });

  /* 名指したリポジトリが画面に揃うまでの待ちを、ほかのプロジェクトの読み取りで長くしない。
   **並べ替えるのは読む順だけである** —— 一覧の並びは索引が決めたままにする。 */
  it('先に名指されたディレクトリのプロジェクトから読む', async () => {
    const scene = sceneOf([sourceOf('a', 'first'), sourceOf('b', 'second')], {
      watched: ['/w/b', '/w/a'],
      readFirst: ['/w/b'],
      cwdBySlug: { a: '/w/a', b: '/w/b' },
    });

    const read: string[] = [];
    const stream = scene.observe.observe(NOW);
    for (let step = await stream.next(); !step.done; step = await stream.next()) {
      if (step.value.kind === 'project') read.push(step.value.project.id);
    }

    expect(read, '後から読むと、名指した相手が画面に出るまで待つことになる').toEqual(['b', 'a']);

    const snapshot = await indexOf(scene);
    expect(
      snapshot.index.stubs.map((stub) => stub.id),
      '読む順が一覧の並びに漏れると、行が読み取りのたびに入れ替わる',
    ).toEqual(['a', 'b']);
  });
});

/** 同じディレクトリに `transcript` が 2 本。どこまで開くかを数えるための場面 */
const twoSessionsOf = (slug: string): TranscriptGroup => ({
  slug,
  sessions: [...sourceOf(slug, 'first').sessions, ...sourceOf(slug, 'second').sessions],
  walked: observed(2),
});

/* 記録していないディレクトリ。

   **名前は全部が見える。中身は記録したところしか読まない。** 名前まで捨てると、そこで
   Claude Code が動いていることに気付けず、Overview から選び直すこともできなくなる。 */
describe('見つけただけのディレクトリ', () => {
  it('いちばん新しい 1 本しか開かない', async () => {
    const scene = sceneOf([twoSessionsOf('a')], { watched: [], cwdBySlug: { a: '/w/a' } });

    await indexOf(scene);

    expect(scene.heads, '全部を開くなら、観る相手を選んだ意味が無い').toHaveLength(1);
  });

  /* 1 本だけ開くのは、そこがどこなのかを知るためである。**名前からは決まらない** ——
     同じディレクトリを別の書き表し方で記録していることが在り、そのとき名前は一致しない。 */
  it('記録したディレクトリは、`transcript` を全部開く', async () => {
    const scene = sceneOf([twoSessionsOf('a')], { watched: ['/w/a'], cwdBySlug: { a: '/w/a' } });

    await indexOf(scene);

    expect(scene.heads).toHaveLength(2);
  });

  it('木には出ない', async () => {
    const scene = sceneOf([sourceOf('a', 'session'), sourceOf('b', 'session')], {
      watched: ['/w/a'],
      cwdBySlug: { a: '/w/a', b: '/w/b' },
    });

    expect(await treeIdsOf(scene), '選んでいないものが並ぶなら、選んだ意味が無い').toEqual(['a']);
  });

  it('索引には名前が残る', async () => {
    const scene = sceneOf([sourceOf('a', 'session'), sourceOf('b', 'session')], {
      watched: ['/w/a'],
      cwdBySlug: { a: '/w/a', b: '/w/b' },
    });

    const snapshot = await indexOf(scene);

    expect(
      snapshot.index.stubs.map((stub) => stub.id),
      '名前まで捨てると、Overview から選び直すこともできなくなる',
    ).toEqual(['a', 'b']);
    expect([...snapshot.watchedIds]).toEqual(['a']);
  });

  /* 同じ場所を `/Volumes/…` と `/Users/…` の両方で書けるように、名前が一致しないことは
     珍しくない。**名前だけで決めると、記録したはずのディレクトリが一覧に出ない。** */
  it('名前が違っても、同じ場所を記録していれば深く読む', async () => {
    const scene = sceneOf([sourceOf('-別の-書き方', 'session')], { watched: ['/w/proj'] });

    expect(await treeIdsOf(scene)).toEqual(['-別の-書き方']);
  });

  /* 1 つ前の形が持っているのは id で、パスは持っていない。id は走査で見えた名前そのものなので、
     名前として突き合わせれば読み替えずに引き継げる。 */
  it('1 つ前の形に留めてあった id は、名前として引き継ぐ', async () => {
    const scene = sceneOf([sourceOf('a', 'session')], { watched: [], watchedSlugs: ['a'] });

    expect(await treeIdsOf(scene), '引き継がないと、更新した日に一覧が黙って空になる').toEqual([
      'a',
    ]);
  });

  /* 読んでよい範囲は観測した範囲である。**観ていないところの `transcript` は開かせない。** */
  it('読んでよい `transcript` は、記録したところのものだけ', async () => {
    const scene = sceneOf([sourceOf('a', 'session'), sourceOf('b', 'session')], {
      watched: ['/w/a'],
      cwdBySlug: { a: '/w/a', b: '/w/b' },
    });

    const snapshot = await indexOf(scene);

    expect([...snapshot.transcriptFiles]).toEqual(['/nest/projects/a/session.jsonl']);
  });
});
