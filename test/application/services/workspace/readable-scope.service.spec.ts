import { describe, expect, it } from 'vitest';
import { absent, observed } from '~/app-kernel/observation.ts';
import {
  allowsTranscript,
  fromTree,
  resolveProject,
} from '~/application/services/workspace/readable-scope.service.ts';

/* ここは抜け穴の検めそのものである。通ってはいけないものが通らないことを、
   1 つずつ名指しで固定する。

   偽物の形は、導出が受け取る形から取る。**字を書き写すと、受け取る形が変わっても
   ここは通ったままになる。** */

type ProjectTree = Parameters<typeof fromTree>[0];
type ObservedProject = ProjectTree['projects'][number];
type TranscriptSession = ObservedProject['sessions'][number];
type SubagentSession = TranscriptSession['subagents'][number];

/** まだ何も動いていない帯。空であることと、見に行けなかったことは別である */
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
    actor: null,
    issues: [],
    current: null,
    activity: NO_ACTIVITY,
    sizeBytes: 0,
    subagents,
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

const alpha = project(ALPHA_SLUG, ALPHA_PATH, [
  session('s1', ALPHA_MAIN, [subagent('s1-review', ALPHA_CHILD)]),
]);
const beta = project(BETA_SLUG, BETA_PATH, [session('s2', BETA_MAIN)]);

const scope = fromTree(tree([alpha, beta]));

/** 断られたときだけ名札を返す。断りの理由を型を崩さずに見るため */
const codeOf = (r: ReturnType<typeof resolveProject>): string | null =>
  r.ok ? null : r.error.code;

describe('観測した巣を id で引く', () => {
  it('観測した id は引ける', () => {
    const r = resolveProject(scope, ALPHA_SLUG);
    expect(r.ok ? r.value : null, '窓は自分の一覧に在る id しか渡さない').toBe(ALPHA_PATH);
  });

  it('知らない id は断る', () => {
    const r = resolveProject(scope, '-Users-me-work-gamma');
    expect(r.ok).toBe(false);
    expect(codeOf(r), '観ていないものは、そんな巣は知らないと答えるほかない').toBe(
      'project.not_observed',
    );
  });

  it('絶対パスを id として渡しても引けない', () => {
    // ここが緩むと、場所を渡り歩くという攻め口がそのまま戻ってくる
    expect(codeOf(resolveProject(scope, '/etc'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, '/etc/passwd'))).toBe('project.not_observed');
  });

  it('一覧にその字が在っても、絶対パスは id として通さない', () => {
    /* 一覧に無いから断れているだけでは、形の門が効いていることにならない。
     **鍵として実在させたうえで**断らせて、門が一覧より先に立っていることを固定する。 */
    const poisoned = fromTree(
      tree([project('/etc', '/etc', [session('p1', `${ROOT}/-p/p1.jsonl`)])]),
    );
    expect(poisoned.projectsById.has('/etc'), '鍵は実在している').toBe(true);
    expect(codeOf(resolveProject(poisoned, '/etc'))).toBe('project.not_observed');
  });

  it('観測した巣の実パスそのものを渡しても引けない', () => {
    // 実際に観測できている場所であっても、id ではないものは id として通さない
    expect(codeOf(resolveProject(scope, ALPHA_PATH))).toBe('project.not_observed');
  });

  it('遡る字を含む id は引けない', () => {
    expect(codeOf(resolveProject(scope, `../${ALPHA_SLUG}`))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, '..'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, '.'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, `${ALPHA_SLUG}/../../etc`))).toBe('project.not_observed');
  });

  it('空の id と、区切りに使えない字を含む id は引けない', () => {
    expect(codeOf(resolveProject(scope, ''))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, `${ALPHA_SLUG}\0`))).toBe('project.not_observed');
  });

  it('断り方は、形が違うときも一覧に無いときも同じ', () => {
    /* 断り方が分かれると、尋ねて回るだけで置き場に何が在るかが分かってしまう。
     **同じであることだけを見てはいけない。** どちらも通ってしまったときも「同じ」になる。 */
    const shaped = codeOf(resolveProject(scope, '/etc'));
    const missing = codeOf(resolveProject(scope, '-unknown'));
    expect(shaped).toBe('project.not_observed');
    expect(missing).toBe(shaped);
  });

  it('土台から生えてくる名前も引けない', () => {
    /* 一覧を素の物入れで持つと、載せた覚えの無い名前が値を持って返る。
       Map で持つのは、鍵にできる字を一覧に載せたものだけに閉じるためである。 */
    expect(codeOf(resolveProject(scope, '__proto__'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, 'constructor'))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, 'toString'))).toBe('project.not_observed');
  });

  it('名前の頭が同じだけの隣は引けない', () => {
    // 前方一致で引けると、名前を伸ばしただけで別の巣の場所が取れる
    expect(codeOf(resolveProject(scope, ALPHA_SLUG.slice(0, -1)))).toBe('project.not_observed');
    expect(codeOf(resolveProject(scope, `${ALPHA_SLUG}x`))).toBe('project.not_observed');
  });

  it('場所の分からない巣は引けない', () => {
    // 名前でしか組めなかった巣に、当てずっぽうの場所を与えない
    const nameless = fromTree(
      tree([project('-broken', null, [session('n1', `${ROOT}/-broken/n1.jsonl`)])]),
    );
    expect(codeOf(resolveProject(nameless, '-broken'))).toBe('project.not_observed');
  });

  it('遡る字を含む場所の巣は引けない', () => {
    /* 解決できなかった巣には、正本に**書かれた**作業場所がそのまま入る。畳んで覚えると、
       書いた側が選んだ場所が「観測できた巣の場所」になり、繋ぎ越しなら OS が開くのは
       畳んだ先とも別の場所になる。 */
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
    expect(forged.projectsById.size, '畳めば字が変わる場所は 1 つも覚えない').toBe(0);
  });
});

describe('観測した正本だけを開かせる', () => {
  it('観測した正本は通る', () => {
    expect(allowsTranscript(scope, ALPHA_MAIN)).toBe(true);
    expect(allowsTranscript(scope, BETA_MAIN)).toBe(true);
  });

  it('子の正本も通る', () => {
    expect(
      allowsTranscript(scope, ALPHA_CHILD),
      '含め忘れると、委譲された仕事の行から会話が開けなくなる',
    ).toBe(true);
  });

  it('観測していない場所は通らない', () => {
    expect(allowsTranscript(scope, '/etc/passwd')).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/-Users-me-work-gamma/s9.jsonl`)).toBe(false);
  });

  it('前方一致では通らない', () => {
    // 観測した正本の隣に置いただけのファイルが、名前の頭が同じというだけで開けてはならない
    expect(allowsTranscript(scope, `${ALPHA_MAIN}.bak`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}/secret.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}`)).toBe(false);
    expect(allowsTranscript(scope, ROOT)).toBe(false);
  });

  it('巣の場所は正本ではない', () => {
    // 引ける場所と開ける正本は別の集合である
    expect(allowsTranscript(scope, ALPHA_PATH)).toBe(false);
  });

  it('相対名と、区切りに使えない字を含む名は通らない', () => {
    expect(allowsTranscript(scope, `${ALPHA_SLUG}/s1.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ALPHA_MAIN}\0.png`)).toBe(false);
    expect(allowsTranscript(scope, '')).toBe(false);
  });

  it('畳めば同じ字になるだけのものは通さない', () => {
    /* 畳んでから見比べると、途中の繋ぎを辿った先の別の中身が、
       観測した正本の字を借りて読めてしまう。渡すのは解決済みの場所だけである。 */
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}/../${ALPHA_SLUG}/s1.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}/${ALPHA_SLUG}/./s1.jsonl`)).toBe(false);
    expect(allowsTranscript(scope, `${ROOT}//${ALPHA_SLUG}/s1.jsonl`)).toBe(false);
  });

  it('畳めば字が変わる正本は、覚える側でも入れない', () => {
    /* 覚えるときに畳むのも、照らすときに畳むのと同じ穴である。
       `<繋ぎ>/../alpha/s1.jsonl` を畳んで覚えると、観測していない中身が
       観測した正本の字で範囲に入る。 */
    const folded = fromTree(
      tree([
        project(ALPHA_SLUG, ALPHA_PATH, [
          session('s1', `${ROOT}/${ALPHA_SLUG}/../${ALPHA_SLUG}/s1.jsonl`),
          session('s2', `${ROOT}//${ALPHA_SLUG}/s2.jsonl`),
        ]),
      ]),
    );
    expect(folded.transcriptFiles.size, '畳めば字が変わる正本は 1 つも覚えない').toBe(0);
    expect(allowsTranscript(folded, ALPHA_MAIN)).toBe(false);
    expect(allowsTranscript(folded, `${ROOT}/${ALPHA_SLUG}/s2.jsonl`)).toBe(false);
  });
});

describe('範囲の出所は観測した木だけ', () => {
  it('観測したものしか入らない', () => {
    expect(scope.projectsById.size, '場所が引けるのは観測できた巣の数だけ').toBe(2);
    expect(scope.transcriptFiles.size, '正本は親 2 つと子 1 つ').toBe(3);
  });

  it('木が入れ替わると範囲も入れ替わる', () => {
    const next = fromTree(tree([beta]));
    expect(codeOf(resolveProject(next, ALPHA_SLUG))).toBe('project.not_observed');
    expect(allowsTranscript(next, ALPHA_MAIN)).toBe(false);
    expect(resolveProject(next, BETA_SLUG).ok, '残っている巣はそのまま引ける').toBe(true);
    expect(allowsTranscript(next, BETA_MAIN)).toBe(true);
  });

  it('新しい範囲を作っても、前の範囲は変わらない', () => {
    fromTree(tree([beta]));
    expect(allowsTranscript(scope, ALPHA_MAIN), '範囲は作った時点の木そのもの').toBe(true);
  });
});
