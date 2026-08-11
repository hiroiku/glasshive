import { describe, expect, it } from 'vitest';
import {
  agentTokens,
  commitToken,
  commitTokens,
  gitTokens,
  issueIndex,
  tokenDict,
} from '~/frameworks/tanstack/ui/derive/tokens.ts';

/* 文の中の語を、観測しているものと突き合わせるインデックス。

   **分からない語は触らない。** 手当たり次第にチップにすると、ふつうの単語が押せるものに
   見えて、押しても何も起きないチップが文中に散る。 */

/* 相手の形は、突き合わせる実装そのものから引く。ここは外の層の名前を `import` できないし、
   写して持てば、形が変わったときに片方だけ古いまま残る。 */
type ProjectJson = NonNullable<Parameters<typeof agentTokens>[0]>;
type SessionJson = ProjectJson['sessions'][number];
type SubagentJson = SessionJson['subagents'][number];

const subagent = (over: Partial<SubagentJson> = {}): SubagentJson => ({
  id: 'sub',
  label: 'sub',
  agent_type: null,
  name: null,
  tool_use: null,
  parent: null,
  depth: 1,
  file: '/nest/sub.jsonl',
  state: 'ended',
  started: null,
  last_activity: '2026-08-09T12:00:00Z',
  tokens: null,
  tokens_state: 'observed',
  model: null,
  effort: null,
  git_branch: null,
  cwd: null,
  issue: null,
  current: null,
  intervals: [],
  intervals_complete: true,
  intervals_state: 'observed',
  ...over,
});

const session = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 'a1b2c3d4e5f6',
  file: '/nest/session.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: null,
  last_activity: '2026-08-09T12:00:00Z',
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

type GitOverviewJson = NonNullable<Parameters<typeof commitTokens>[0]>;

const overview = (over: Partial<GitOverviewJson> = {}): GitOverviewJson => ({
  state: 'observed',
  reason: null,
  base: 'main',
  worktrees: [],
  branches: [],
  mainline: [],
  mainline_truncated: false,
  tips: [],
  conflicts: [],
  ...over,
});

const project = (sessions: SessionJson[]): ProjectJson => ({
  id: 'a',
  slug: 'a',
  path: '/nest/a',
  name: 'a',
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions,
});

describe('エージェントを特定できる語', () => {
  /* `transcript` の本文には `mgr-{セッション id の先頭 8 桁}` という綴りでセッションが
     名指されることがある。 */
  it('命名の決め事からも引ける', () => {
    const index = agentTokens(project([session({ id: 'a1b2c3d4e5f6' })]));

    expect(index.get('mgr-a1b2c3d4')).toBeDefined();
  });

  it('子のラベルでも引ける', () => {
    const index = agentTokens(
      project([session({ subagents: [subagent({ label: 'reviewer', file: '/nest/r.jsonl' })] })]),
    );

    expect(index.get('reviewer')?.file).toBe('/nest/r.jsonl');
  });

  it('同じ名前が二度出たら、先に見付けたほうを残す', () => {
    const index = agentTokens(
      project([
        session({ subagents: [subagent({ label: 'dup', file: '/nest/first.jsonl' })] }),
        session({ subagents: [subagent({ label: 'dup', file: '/nest/second.jsonl' })] }),
      ]),
    );

    expect(index.get('dup')?.file).toBe('/nest/first.jsonl');
  });

  it('セッションの id そのものと、その頭 8 桁で引ける', () => {
    const index = agentTokens(
      project([session({ id: '2cf88813-17bb-40ec-9bb1-bdb0d47a4018', file: '/nest/s.jsonl' })]),
    );

    expect(index.get('2cf88813-17bb-40ec-9bb1-bdb0d47a4018')?.file).toBe('/nest/s.jsonl');
    expect(index.get('2cf88813')?.file).toBe('/nest/s.jsonl');
  });

  /* 親を指す欄には `agent-` の頭が付いていない。 */
  it('子の id は、頭が付いていても付いていなくても引ける', () => {
    const index = agentTokens(
      project([
        session({ subagents: [subagent({ id: 'agent-a264a81ee', file: '/nest/c.jsonl' })] }),
      ]),
    );

    expect(index.get('agent-a264a81ee')?.file).toBe('/nest/c.jsonl');
    expect(index.get('a264a81ee')?.file).toBe('/nest/c.jsonl');
  });

  /* 子どうしが互いを呼ぶときに使うのはこの `name` で、id でもラベルでもない。 */
  it('呼びかけに使う名前で引ける', () => {
    const index = agentTokens(
      project([
        session({
          subagents: [
            subagent({
              id: 'agent-averify-5ea-1-c0cd27ed',
              name: 'verify-5ea-1',
              file: '/n/v.jsonl',
            }),
          ],
        }),
      ]),
    );

    expect(index.get('verify-5ea-1')?.file).toBe('/n/v.jsonl');
  });

  it('生まれた `tool_use` の id で引ける', () => {
    const index = agentTokens(
      project([
        session({ subagents: [subagent({ tool_use: 'toolu_01PRz', file: '/n/t.jsonl' })] }),
      ]),
    );

    expect(index.get('toolu_01PRz')?.file).toBe('/n/t.jsonl');
  });

  /* `*.meta.json` は `transcript` のパスを書く。パスの最後の要素がこれに当たる。 */
  it('`transcript` のファイル名でも引ける', () => {
    const index = agentTokens(
      project([
        session({ id: 'a1b2', file: '/n/s.jsonl', subagents: [subagent({ id: 'agent-a9' })] }),
      ]),
    );

    expect(index.get('a1b2.jsonl')?.file).toBe('/n/s.jsonl');
    expect(index.get('agent-a9.jsonl')).toBeDefined();
  });

  it('観測が無ければ空', () => {
    expect(agentTokens(undefined).size).toBe(0);
  });
});

describe('ブランチと `worktree` の名前', () => {
  it('ブランチの名前を拾う', () => {
    const index = gitTokens(project([session({ git_branch: 'feature/x' })]));

    expect(index.get('feature/x')).toBe('branch');
  });

  it('`worktree` の名前をパスの決め事から拾う', () => {
    const index = gitTokens(project([session({ cwd: '/repo/.worktrees/mgr-a' })]));

    expect(index.get('mgr-a')).toBe('worktree');
  });

  it('子のブランチも拾う', () => {
    const index = gitTokens(project([session({ subagents: [subagent({ git_branch: 'sub/y' })] })]));

    expect(index.get('sub/y')).toBe('branch');
  });

  /* マージ済みのブランチを文が指すことはある。いま居るエージェントから拾うだけでは足りない。 */
  it('誰も居ないブランチと `worktree` も、git の観測から拾う', () => {
    const index = gitTokens(
      undefined,
      overview({
        branches: [{ name: 'work/done', sha: 'abc1234', date: '', subject: '', head: false }],
        worktrees: [
          { path: '/repo/.worktrees/mgr-b', branch: 'work/b', sha: null, detached: false },
        ],
      }),
    );

    expect(index.get('work/done')).toBe('branch');
    expect(index.get('mgr-b')).toBe('worktree');
    expect(index.get('work/b')).toBe('branch');
  });

  /* ブランチから離れて置かれた `worktree` は `HEAD` を記録する。指す先が無い。 */
  it('`HEAD` はブランチとして扱わない', () => {
    const index = gitTokens(project([session({ git_branch: 'HEAD' })]));

    expect(index.get('HEAD')).toBeUndefined();
  });
});

describe('コミットの sha のインデックス', () => {
  const mainline = overview({
    mainline: [
      {
        sha: '7f3473bcc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
        merge: false,
        date: '',
        subject: '辞書で引く',
      },
    ],
  });

  it('正式な sha で引ける', () => {
    expect(commitTokens(mainline).get('7f3473bcc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6')?.subject).toBe(
      '辞書で引く',
    );
  });

  it('略記の頭からも引ける', () => {
    expect(commitTokens(mainline).get('7f3473b')?.rev).toBe(
      '7f3473bcc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
    );
  });

  it('短すぎる頭はインデックスに入れない', () => {
    expect(commitTokens(mainline).get('7f3473')).toBeUndefined();
  });

  it('16 進でないものは sha として扱わない', () => {
    const index = commitTokens(
      overview({
        branches: [{ name: 'main', sha: 'zzzzzzz', date: '', subject: '', head: true }],
      }),
    );

    expect(index.size).toBe(0);
  });

  it('`git` を読めていなければ空', () => {
    expect(commitTokens(undefined).size).toBe(0);
  });

  /* 画面の行が持つ sha は桁が揃っておらず、突き合わせは部分一致である。 */
  it('光らせるのは、皆が持っている最初の 7 桁', () => {
    expect(commitToken('6abcf31e9a')).toBe('6abcf31');
    expect(commitToken('cd0b252c3366f4a331b002a384cf77368baaa43d')).toBe('cd0b252');
  });
});

describe('一つの辞書として引く', () => {
  const dict = () =>
    tokenDict(
      issueIndex([{ id: '#209', status: 'open' }]),
      agentTokens(project([session({ id: 'a1b2c3d4e5f6', subagents: [subagent()] })])),
      gitTokens(project([session({ git_branch: 'work/x' })])),
      commitTokens(
        overview({
          mainline: [
            {
              sha: '7f3473bcc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
              merge: false,
              date: '',
              subject: '辞書で引く',
            },
          ],
        }),
      ),
    );

  it('分からない語は触らない', () => {
    expect(dict().lookup('ふつうの語')).toBeNull();
    expect(dict().lookup('README')).toBeNull();
  });

  it('種類ごとに指す先が違う', () => {
    expect(dict().lookup('#209')).toEqual({
      kind: 'issue',
      id: '#209',
      closed: false,
    });
    expect(dict().lookup('work/x')?.kind).toBe('ref');
    expect(dict().lookup('mgr-a1b2c3d4')?.kind).toBe('agent');
    expect(dict().lookup('7f3473b')?.kind).toBe('commit');
  });

  /* 文のほうがインデックスより長い桁で書いていることがある。 */
  it('インデックスより長い桁で書かれた sha も当てる', () => {
    const index = tokenDict(
      new Map(),
      new Map(),
      new Map(),
      commitTokens(
        overview({
          branches: [{ name: 'main', sha: '7f3473b', date: '', subject: '', head: true }],
        }),
      ),
    );

    expect(index.lookup('7f3473bcc1d2e3f4')?.kind).toBe('commit');
  });

  /* 子の id も 16 進である。先に sha を当てると、子が軒並みコミットに化ける。 */
  it('名前の付いたものが、16 進の前方一致に勝つ', () => {
    const index = tokenDict(
      new Map(),
      agentTokens(
        project([
          session({ subagents: [subagent({ id: 'agent-7f3473bcc', file: '/n/c.jsonl' })] }),
        ]),
      ),
      new Map(),
      commitTokens(
        overview({
          mainline: [{ sha: '7f3473bcc1d2', merge: false, date: '', subject: '' }],
        }),
      ),
    );

    expect(index.lookup('7f3473bcc')?.kind).toBe('agent');
  });

  it('どれも空なら空と言う', () => {
    expect(tokenDict(new Map(), new Map(), new Map(), new Map()).empty).toBe(true);
    expect(dict().empty).toBe(false);
  });
});

describe('課題の id のインデックス', () => {
  it('書かれたとおりの id で引ける', () => {
    const index = issueIndex([{ id: '#209', status: 'open' }]);

    expect(index.get('#209')).toEqual({ id: '#209', closed: false });
  });

  it('閉じたものもインデックスに入れる', () => {
    const index = issueIndex([{ id: '#209', status: 'closed' }]);

    expect(index.get('#209')?.closed).toBe(true);
  });

  /* `#` の落ちた番号を鍵にすると、文中のただの数がチップに化ける。 */
  it('番号だけでは引かない', () => {
    const index = issueIndex([{ id: '#209', status: 'open' }]);

    expect(index.get('209'), 'ふつうの数に当たってしまう').toBeUndefined();
    expect(index.size).toBe(1);
  });

  it('課題が 1 件も無ければ空', () => {
    expect(issueIndex([]).size).toBe(0);
  });
});
