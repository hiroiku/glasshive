import { describe, expect, it } from 'vitest';
import {
  counted,
  sourcesStateOf,
  transcriptScan,
} from '~/frameworks/tanstack/ui/derive/sources.ts';
import { defaultTranslator as t } from '~/frameworks/tanstack/ui/i18n/useT.ts';

/* 「出ている数がこれで全部か」を決める 1 つの述語。

   タブの件数も、空の表の言い分も、統計フッターの階段も、一覧の点も、同じこの問いに
   答えを出している。**片方だけを直すと、画面ごとに答えが割れる。** */

/* 材料の形は、述語そのものから引く。書き写すと、向こう側の形が変わってもここだけが通り続ける */
type ProjectJson = Parameters<typeof sourcesStateOf>[0];
type SessionJson = ProjectJson['sessions'][number];

const session = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 'sess',
  file: '/p/sess.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: null,
  last_activity: '2026-08-09T12:00:00.000Z',
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
  ...over,
});

const project = (over: Partial<ProjectJson> = {}): ProjectJson => ({
  id: 'p',
  slug: 'p',
  path: '/p',
  name: 'p',
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [session()],
  ...over,
});

describe('プロジェクトを、どこまで数え上げられたか', () => {
  it('両方歩けたなら、プロジェクトの観測をそのまま返す', () => {
    expect(sourcesStateOf(project())).toBe('observed');
    expect(counted(project())).toBe(true);
  });

  it('プロジェクトのディレクトリを歩けなかったなら、数え上げられていない', () => {
    const blocked = project({ sources: { state: 'unobservable', reason: 'EACCES' } });

    expect(sourcesStateOf(blocked)).toBe('unobservable');
    expect(counted(blocked)).toBe(false);
  });

  it('子のディレクトリを歩けなかったセッションが 1 つでも在れば、数え上げられていない', () => {
    const short = project({
      sessions: [session(), session({ sources: { state: 'unobservable', reason: 'EACCES' } })],
    });

    expect(
      sourcesStateOf(short),
      'プロジェクトの側だけを見ると、数え損ねた子が居なかったことになる',
    ).toBe('unobservable');
    expect(counted(short)).toBe(false);
  });

  it('ディレクトリが無かったことを、歩けなかったことに変えない', () => {
    const gone = project({ sessions: [], sources: { state: 'absent', reason: 'ENOENT' } });

    expect(sourcesStateOf(gone), '「無かった」と「観測できなかった」は別である').toBe('absent');
    expect(counted(gone), '歩き切った上での 0 は、言い切ってよい数である').toBe(true);
  });

  it('セッションが 1 つも無くても、プロジェクトの観測は読める', () => {
    expect(sourcesStateOf(project({ sessions: [] }))).toBe('observed');
  });
});

/* `~/.claude/projects` をどこまで歩いたか。

   数えるのは `transcript` の本数である。**一覧に並んだプロジェクトの数ではない** —— 索引は
   最初の 1 枚で全部のプロジェクトを敷くので、行の数は最初から動かない。 */
describe('読み取りの進み具合', () => {
  type TreeJson = Parameters<typeof transcriptScan>[1];
  const tree = (progress: NonNullable<TreeJson>['progress']): TreeJson =>
    ({ progress }) as TreeJson;

  it('何を数えたのかまで 1 行にする', () => {
    const scan = transcriptScan(t, tree({ read_transcripts: 312, total_transcripts: 4180 }));

    expect(scan?.done).toBe(312);
    expect(scan?.total).toBe(4180);
    expect(scan?.text, '裸の「7%」は、何の 7% なのかを言わない').toBe('312 of 4,180 transcripts');
  });

  /* 索引が届く前と、読み終えた後は、どちらも進み具合を持たない。**そこで塗らない** ——
     塗る幅は観測した量ではなく、見た目のための数になる。 */
  it.each([
    ['索引がまだ届いていない', undefined],
    ['読み終えている', tree(null)],
    ['本数を数えられていない', tree({ read_transcripts: 0, total_transcripts: 0 })],
  ])('%sときは、塗る幅を出さない', (_name, given) => {
    expect(
      transcriptScan(t, given),
      '分母を観測していない割合を、画面にも読み上げにも渡せない',
    ).toBe(null);
  });
});
