import { describe, expect, it } from 'vitest';
import { counted, sourcesStateOf } from '~/frameworks/tanstack/ui/derive/sources.ts';

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
