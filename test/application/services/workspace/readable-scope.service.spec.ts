import { describe, expect, it } from 'vitest';
import { absent, observed } from '~/app-kernel/observation.ts';
import {
  allowsTranscript,
  fromIndex,
  fromTree,
  resolveProject,
} from '~/application/services/workspace/readable-scope.service.ts';

/* ここは抜け穴の検証そのものである。通ってはいけないものが通らないことを、
   1 つずつ名指しで固定する。

   偽物の形は、導出が受け取る型から取る。**型を手で書き写すと、受け取る形が変わっても
   ここは通ったままになる。** */

type ProjectTree = Parameters<typeof fromTree>[0];
type ProjectIndex = Parameters<typeof fromIndex>[0];
type ProjectStub = ProjectIndex['stubs'][number];
type ObservedProject = ProjectTree['projects'][number];
type TranscriptSession = ObservedProject['sessions'][number];
type SubagentSession = TranscriptSession['subagents'][number];

/** まだ何も動いていない稼働区間。空であることと、観測できなかったことは別である */
const NO_ACTIVITY: TranscriptSession['activity'] = observed({
  intervals: [],
  complete: true,
});

const ROOT = '/Users/me/.claude/projects';

const ALPHA_SLUG = '-Users-me-work-alpha';
const ALPHA_PATH = '/Users/me/work/alpha';
const ALPHA_MAIN = `${ROOT}/${ALPHA_SLUG}/s1.jsonl`;
const ALPHA_CHILD = `${ROOT}/${ALPHA_SLUG}/s1/subagents/s1-review.jsonl`;

const BETA_SLUG = '-Users-me-work-beta';
const BETA_PATH = '/Users/me/work/beta';
const BETA_MAIN = `${ROOT}/${BETA_SLUG}/s2.jsonl`;

function subagent(id: string, file: string): SubagentSession {
  return {
    id,
    label: id,
    agentType: null,
    name: null,
    toolUseId: null,
    parentId: null,
    depth: 1,
    file,
    state: 'ended',
    startedRaw: null,
    lastActivityMs: 0,
    tokens: absent('out-of-window'),
    model: null,
    effort: null,
    gitBranch: null,
    cwd: null,
    issue: null,
    current: null,
    activity: NO_ACTIVITY,
  };
}

function session(
  id: string,
  file: string,
  subagents: readonly SubagentSession[] = [],
): TranscriptSession {
  return {
    id,
    file,
    state: 'ended',
    awaiting: null,
    title: null,
    startedRaw: null,
    lastActivityMs: 0,
    ownMtimeMs: 0,
    tokens: absent('out-of-window'),
    model: null,
    effort: null,
    gitBranch: null,
    cwd: null,
    issues: [],
    current: null,
    activity: NO_ACTIVITY,
    sizeBytes: 0,
    subagents,
    subagentsWalked: observed(subagents.length),
  };
}

function project(
  id: string,
  canonicalPath: string | null,
  sessions: readonly TranscriptSession[],
): ObservedProject {
  return {
    id,
    slugs: [id],
    path: canonicalPath,
    canonicalPath,
    name: id,
    liveProcessCount: 0,
    sessions,
    latestActivityMs: 0,
    recentTokens: absent('out-of-window'),
    walked: observed(sessions.length),
  };
}

function tree(projects: readonly ObservedProject[]): ProjectTree {
  return {
    generatedAtMs: 0,
    activeThresholdMs: 60_000,
    sources: observed(projects.length),
    processes: observed(0),
    projects,
  };
}

function stub(id: string, canonicalPath: string | null): ProjectStub {
  return {
    id,
    slugs: [id],
    path: canonicalPath,
    canonicalPath,
    name: id,
    liveProcessCount: 0,
    latestActivityMs: 0,
    transcriptCount: 0,
    walked: observed(0),
  };
}

function index(stubs: readonly ProjectStub[]): ProjectIndex {
  return {
    generatedAtMs: 0,
    activeThresholdMs: 60_000,
    sources: observed(stubs.length),
    processes: observed(0),
    stubs,
  };
}

const alpha = project(ALPHA_SLUG, ALPHA_PATH, [
  session('s1', ALPHA_MAIN, [subagent('s1-review', ALPHA_CHILD)]),
]);
const beta = project(BETA_SLUG, BETA_PATH, [session('s2', BETA_MAIN)]);

const scope = fromTree(tree([alpha, beta]));

/** 断られたときだけエラーコードを返す。断りの理由を型を崩さずに見るため */
const codeOf = (r: ReturnType<typeof resolveProject>): string | null =>
  r.ok ? null : r.error.code;

describe('観測したプロジェクトを id で引く', () => {
  it('観測した id は引ける', () => {
    const r = resolveProject(scope, ALPHA_SLUG);
    expect(r.ok ? r.value : null, 'コントローラーは自分の一覧に在る id しか渡さない').toBe(
      ALPHA_PATH,
    );
  });

  it('知らない id は断る', () => {
    const r = resolveProject(scope, '-Users-me-work-gamma');
    expect(r.ok).toBe(false);
    expect(codeOf(r), '観測していないものは、そんなプロジェクトは知らないと答えるほかない').toBe(
      'project.not_observed',
    );
  });

  it('絶対パスを id として渡しても引けない', () => {
    // ここが緩むと、パスを渡り歩くという攻撃面がそのまま戻ってくる
    expect(codeOf(resolveProject(scope, '/etc'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, '/etc/passwd'))).toBe('project.not_observed');
  });

  it('一覧にその文字列が在っても、絶対パスは id として通さない', () => {
    /* 一覧に無いから断れているだけでは、形式のガードが効いていることにならない。
     **キーとして実在させたうえで**断らせて、形式のガードが一覧の照合より先に立つことを固定する。 */
    const poisoned = fromTree(
      tree([project('/etc', '/etc', [session('p1', `${ROOT}/-p/p1.jsonl`)])]),
    );
    expect(poisoned.projectsById.has('/etc'), 'キーは実在している').toBe(true);
    expect(codeOf(resolveProject(poisoned, '/etc'))).toBe('project.not_observed');
  });

  it('観測したプロジェクトの実パスそのものを渡しても引けない', () => {
    // 実際に観測できているパスであっても、id ではないものは id として通さない
    expect(codeOf(resolveProject(scope, ALPHA_PATH))).toBe('project.not_observed');
  });

  it('`..` を含む id は引けない', () => {
    expect(codeOf(resolveProject(scope, `../${ALPHA_SLUG}`))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, '..'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, '.'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, `${ALPHA_SLUG}/../../etc`))).toBe('project.not_observed');
  });

  it('空の id と、区切りに使えない文字を含む id は引けない', () => {
    expect(codeOf(resolveProject(scope, ''))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, `${ALPHA_SLUG}\0`))).toBe('project.not_observed');
  });

  it('断り方は、形が違うときも一覧に無いときも同じ', () => {
    /* 断り方が分かれると、尋ねて回るだけで `~/.claude/projects` に何が在るかが分かってしまう。
     **同じであることだけを見てはいけない。** どちらも通ってしまったときも「同じ」になる。 */
    const shaped = codeOf(resolveProject(scope, '/etc'));
    const missing = codeOf(resolveProject(scope, '-unknown'));
    expect(shaped).toBe('project.not_observed');
    expect(missing).toBe(shaped);
  });

  it('プロトタイプから生えてくる名前も引けない', () => {
    /* 一覧を素のオブジェクトで持つと、載せた覚えの無い名前が値を持って返る。
       `Map` で持つのは、キーにできる文字列を一覧に載せたものだけに閉じるためである。 */
    expect(codeOf(resolveProject(scope, '__proto__'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, 'constructor'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, 'toString'))).toBe('project.not_observed');
  });

  it('名前の頭が同じだけの隣は引けない', () => {
    // 前方一致で引けると、名前を伸ばしただけで別のプロジェクトのパスが取れる
    expect(codeOf(resolveProject(scope, ALPHA_SLUG.slice(0, -1)))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, `${ALPHA_SLUG}x`))).toBe('project.not_observed');
  });

  it('パスの分からないプロジェクトは引けない', () => {
    // 名前でしか組めなかったプロジェクトに、当てずっぽうのパスを与えない
    const nameless = fromTree(
      tree([project('-broken', null, [session('n1', `${ROOT}/-broken/n1.jsonl`)])]),
    );
    expect(codeOf(resolveProject(nameless, '-broken'))).toBe('project.not_observed');
  });

  it('`..` を含むパスのプロジェクトは引けない', () => {
    /* 解決できなかったプロジェクトには、`transcript` に**書かれた**作業ディレクトリがそのまま入る。
       正規化して覚えると、書いた側が選んだパスが「観測できたプロジェクトのパス」になり、
       シンボリックリンク越しなら OS が開くのは正規化した先とも別のパスになる。 */
    const forged = fromTree(
      tree([
        project('-forged', `${ALPHA_PATH}/../../../../etc`, [
          session('f1', `${ROOT}/-forged/f1.jsonl`),
        ]),
        project('-linked', `${ALPHA_PATH}/link/../secrets`, [
          session('f2', `${ROOT}/-linked/f2.jsonl`),
        ]),
        project('-sloppy', `${ALPHA_PATH}//nested`, [session('f3', `${ROOT}/-sloppy/f3.jsonl`)]),
      ]),
    );
    expect(codeOf(resolveProject(forged, '-forged'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(forged, '-linked'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(forged, '-sloppy'))).toBe('project.not_observed');
    expect(forged.projectsById.size, '正規化すると表記が変わるパスは 1 つも覚えない').toBe(0);
  });
});

describe('観測した `transcript` だけを開かせる', () => {
  it('観測した `transcript` は通る', () => {
    expect(allowsTranscript(scope, ALPHA_MAIN)).toBe(true);
    expect(allowsTranscript(scope, BETA_MAIN)).toBe(true);
  });

  it('サブエージェントの `transcript` も通る', () => {
    expect(
      allowsTranscript(scope, ALPHA_CHILD),
      '含め忘れると、委譲された仕事の行から会話が開けなくなる',
    ).toBe(true);
  });

  it('観測していないパスは通らない', () => {
    expect(allowsTranscript(scope, '/etc/passwd')).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/-Users-me-work-gamma/s9.jsonl`)).toBe(false);
  });

  it('前方一致では通らない', () => {
    // 観測した `transcript` の隣に置いただけのファイルが、名前の頭が同じというだけで開けてはならない
    expect(allowsTranscript(scope, `${ALPHA_MAIN}.bak`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}/secret.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}`)).toBe(false);
    expect(allowsTranscript(scope, ROOT)).toBe(false);
  });

  it('プロジェクトのパスは `transcript` ではない', () => {
    // 引けるパスと開ける `transcript` は別の集合である
    expect(allowsTranscript(scope, ALPHA_PATH)).toBe(false);
  });

  it('相対名と、区切りに使えない文字を含む名は通らない', () => {
    expect(allowsTranscript(scope, `${ALPHA_SLUG}/s1.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ALPHA_MAIN}\0.png`)).toBe(false);
    expect(allowsTranscript(scope, '')).toBe(false);
  });

  it('正規化すれば同じ表記になるだけのものは通さない', () => {
    /* 正規化してから見比べると、途中のシンボリックリンクを辿った先の別の中身が、
       観測した `transcript` の表記を借りて読めてしまう。渡すのは解決済みのパスだけである。 */
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}/../${ALPHA_SLUG}/s1.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}/./s1.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}//${ALPHA_SLUG}/s1.jsonl`)).toBe(false);
  });

  it('正規化すると表記が変わる `transcript` は、覚える側でも入れない', () => {
    /* 覚えるときに正規化するのも、照合するときに正規化するのと同じ穴である。
       `<シンボリックリンク>/../alpha/s1.jsonl` を正規化して覚えると、観測していない中身が
       観測した `transcript` の表記で範囲に入る。 */
    const folded = fromTree(
      tree([
        project(ALPHA_SLUG, ALPHA_PATH, [
          session('s1', `${ROOT}/${ALPHA_SLUG}/../${ALPHA_SLUG}/s1.jsonl`),
          session('s2', `${ROOT}//${ALPHA_SLUG}/s2.jsonl`),
        ]),
      ]),
    );
    expect(folded.transcriptFiles.size, '正規化すると表記が変わる `transcript` は覚えない').toBe(0);
    expect(allowsTranscript(folded, ALPHA_MAIN)).toBe(false);
    expect(allowsTranscript(folded, `${ROOT}/${ALPHA_SLUG}/s2.jsonl`)).toBe(false);
  });
});

describe('範囲の出所は観測した木だけ', () => {
  it('観測したものしか入らない', () => {
    expect(scope.projectsById.size, 'パスが引けるのは観測できたプロジェクトの数だけ').toBe(2);
    expect(scope.transcriptFiles.size, '`transcript` は親 2 つと子 1 つ').toBe(3);
  });

  it('木が入れ替わると範囲も入れ替わる', () => {
    const next = fromTree(tree([beta]));
    expect(codeOf(resolveProject(next, ALPHA_SLUG))).toBe('project.not_observed');
    expect(allowsTranscript(next, ALPHA_MAIN)).toBe(false);
    expect(resolveProject(next, BETA_SLUG).ok, '残っているプロジェクトはそのまま引ける').toBe(true);
    expect(allowsTranscript(next, BETA_MAIN)).toBe(true);
  });

  it('新しい範囲を作っても、前の範囲は変わらない', () => {
    fromTree(tree([beta]));
    expect(allowsTranscript(scope, ALPHA_MAIN), '範囲は作った時点の木そのもの').toBe(true);
  });
});

/* 中身を読む前の索引から作る範囲。issues と git と会話はこちらを使う。

   **木から作る範囲と食い違ってはいけない。** 片方だけが通すパスが在れば、そのパスは
   「木では読めないのに索引では読める」ものになる。同じ入力からは同じ集合が出ること、
   そして断る決まりが両方で同じであることを、ここで固定する。 */
describe('索引から作る範囲', () => {
  const observedFiles = new Set([ALPHA_MAIN, ALPHA_CHILD, BETA_MAIN]);
  const fromStubs = fromIndex(
    index([stub(ALPHA_SLUG, ALPHA_PATH), stub(BETA_SLUG, BETA_PATH)]),
    observedFiles,
  );

  it('木から作る範囲と同じものを通す', () => {
    expect([...fromStubs.projectsById].sort()).toEqual([...scope.projectsById].sort());
    expect([...fromStubs.transcriptFiles].sort()).toEqual([...scope.transcriptFiles].sort());
  });

  it('知らない id は、木のときと同じ断り方をする', () => {
    expect(codeOf(resolveProject(fromStubs, '-Users-me-work-gamma'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(fromStubs, ALPHA_PATH))).toBe('project.not_observed');
    expect(codeOf(resolveProject(fromStubs, `../${ALPHA_SLUG}`))).toBe('project.not_observed');
  });

  it('正規化すると表記が変わるパスは覚えない', () => {
    const forged = fromIndex(
      index([
        stub('-forged', `${ALPHA_PATH}/../../../../etc`),
        stub('-linked', `${ALPHA_PATH}/link/../secrets`),
        stub('-nameless', null),
      ]),
      new Set(),
    );
    expect(forged.projectsById.size, '書かれた文字列は観測ではない').toBe(0);
  });

  it('渡された `transcript` でも、正規化すると表記が変わるものは入れない', () => {
    const folded = fromIndex(
      index([stub(ALPHA_SLUG, ALPHA_PATH)]),
      new Set([
        `${ROOT}/${ALPHA_SLUG}/../${ALPHA_SLUG}/s1.jsonl`,
        `${ROOT}//${ALPHA_SLUG}/s2.jsonl`,
      ]),
    );
    expect(
      folded.transcriptFiles.size,
      '覚える側で正規化するのも、照らす側で正規化するのと同じ穴である',
    ).toBe(0);
    expect(allowsTranscript(folded, ALPHA_MAIN)).toBe(false);
  });

  it('`transcript` は渡された集合から取る', () => {
    /* 走査結果をそのまま入れると、子として数えない名前のファイルまで通る。
       範囲に入るのは、索引を組んだ側が `transcript` として数えたものだけである。 */
    const narrow = fromIndex(index([stub(ALPHA_SLUG, ALPHA_PATH)]), new Set([ALPHA_MAIN]));
    expect(allowsTranscript(narrow, ALPHA_MAIN)).toBe(true);
    expect(allowsTranscript(narrow, ALPHA_CHILD)).toBe(false);
    expect(allowsTranscript(narrow, `${ROOT}/${ALPHA_SLUG}/s1/subagents/other.jsonl`)).toBe(false);
  });
});
