import { describe, expect, it } from 'vitest';
import {
  classifyLastEvent,
  deriveAiTitle,
  deriveCurrentActivity,
  deriveUserTitle,
  parseSessionMeta,
  parseSubagentMeta,
} from '~/domain/services/sessions/transcript-meta.service.ts';

/** `transcript` のテキストをその場で組む。ファイルは 1 つも要らない */
const jsonl = (...records: readonly unknown[]): string =>
  records.map((record) => `${JSON.stringify(record)}\n`).join('');

describe('セッションのメタ情報を導き出す', () => {
  const head = jsonl(
    {
      type: 'user',
      cwd: '/work/myproj',
      gitBranch: 'main',
      timestamp: '2026-08-04T00:00:00Z',
      message: {
        role: 'user',
        content: '最初の依頼をここに書く',
      },
    },
    {
      type: 'assistant',
      cwd: '/work/myproj',
      timestamp: '2026-08-04T00:00:05Z',
      effort: 'xhigh',
      message: {
        role: 'assistant',
        model: 'claude-opus-5',
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: 'cd .worktrees/foo-123 && echo hi',
              description: 'テスト実行',
            },
          },
        ],
      },
    },
    { type: 'ai-title', aiTitle: 'タイトルはこれ' },
  );

  it('ai-title が最初の発話より優先される', () => {
    expect(
      parseSessionMeta(head, '').title,
      'Claude Code が付けた題は最初の発話より後に決まるので、走査を終えてから被せる',
    ).toBe('タイトルはこれ');
  });

  it('作業ディレクトリ・起点・ブランチ・モデル・エフォート・状態を 1 度の走査で揃える', () => {
    const meta = parseSessionMeta(head, '');
    expect(meta.cwd).toBe('/work/myproj');
    expect(meta.startedRaw, '起点は作業ディレクトリを決めた行の時刻と揃う').toBe(
      '2026-08-04T00:00:00Z',
    );
    expect(meta.gitBranch).toBe('main');
    expect(meta.model).toBe('claude-opus-5');
    expect(meta.effort).toBe('xhigh');
    expect(meta.issues).toEqual(['foo-123']);
    expect(meta.current, 'ツールの一言は `description` を先に見る').toBe('Bash: テスト実行');
  });

  it('末尾が tool_use なら自分の番は終わっていない', () => {
    const meta = parseSessionMeta(head, '');
    expect(meta.lastEventShape).toBe('tool');
    expect(meta.awaitingCandidate, 'ツールを呼んだ直後はまだ自分の番である').toBe(false);
  });

  it('末尾が本文なら人の入力待ちの候補になる', () => {
    const tail = jsonl({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '完了' }] },
    });
    const meta = parseSessionMeta(head, tail);
    expect(meta.lastEventShape).toBe('text');
    expect(meta.awaitingCandidate).toBe(true);
  });

  it('末尾が問いかけなら人の入力待ちの候補になる', () => {
    const tail = jsonl({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }],
      },
    });
    const meta = parseSessionMeta(head, tail);
    expect(meta.lastEventShape, '問いかけだけはツールではなく待ちとして数える').toBe('ask');
    expect(meta.awaitingCandidate).toBe(true);
  });

  it('末尾が停止フックなら人の入力待ちの候補になる', () => {
    const tail = jsonl({ type: 'system', subtype: 'stop_hook_ran' });
    const meta = parseSessionMeta(head, tail);
    expect(meta.lastEventShape).toBe('stop');
    expect(meta.awaitingCandidate).toBe(true);
  });

  it('停止を含まない system の行では末尾の形が変わらない', () => {
    const tail = jsonl(
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '完了' }] },
      },
      { type: 'system', subtype: 'compact_boundary' },
    );
    expect(
      parseSessionMeta(head, tail).lastEventShape,
      '添え物の行で直前のやりとりの形を消してはいけない',
    ).toBe('text');
  });

  it('末尾が考え事なら待ちにならない', () => {
    const tail = jsonl({
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: 'む' }] },
    });
    const meta = parseSessionMeta(head, tail);
    expect(meta.lastEventShape).toBe('think');
    expect(meta.awaitingCandidate).toBe(false);
  });

  it('末尾が `tool_result` なら待ちにならず、状態は定まった言葉になる', () => {
    const tail = jsonl({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: 'hi' }] },
    });
    const meta = parseSessionMeta(head, tail);
    expect(meta.lastEventShape).toBe('tool_result');
    expect(meta.awaitingCandidate).toBe(false);
    expect(meta.current, '`tool_result` の行には状態を語る手掛かりが無い').toBe(
      'received tool result',
    );
  });

  it('知らない種別のブロックが末尾に在るときは末尾の形が変わらない', () => {
    const tail = jsonl(
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '完了' }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'image', source: {} }] },
      },
    );
    expect(
      parseSessionMeta(head, tail).lastEventShape,
      '種別を持つ最後のブロックで判断を止めるので、手前の本文までは遡らない',
    ).toBe('text');
  });

  it('issues は `head` と `tail` から併合され、5 件で切られる', () => {
    const headIssues = jsonl({
      type: 'user',
      cwd: '/w',
      message: { content: '.worktrees/a-1 .worktrees/a-2 .worktrees/a-3' },
    });
    const tailIssues = jsonl({
      type: 'user',
      cwd: '/w',
      message: {
        content: '.worktrees/a-3 .worktrees/b-1 .worktrees/b-2 .worktrees/b-3',
      },
    });
    expect(parseSessionMeta(headIssues, tailIssues).issues).toEqual([
      'a-1',
      'a-2',
      'a-3',
      'b-1',
      'b-2',
    ]);
  });

  it('<synthetic> の行でもエフォートと状態は採る', () => {
    const lines = jsonl(
      {
        type: 'assistant',
        cwd: '/w',
        timestamp: 't1',
        effort: 'low',
        message: {
          model: 'claude-opus-5',
          content: [{ type: 'thinking', thinking: 'む' }],
        },
      },
      {
        type: 'assistant',
        effort: 'xhigh',
        message: {
          model: '<synthetic>',
          content: [{ type: 'text', text: 'a' }],
        },
      },
    );
    const meta = parseSessionMeta(lines, '');
    expect(meta.model, '合成メッセージの目印はモデルの名前ではない').toBe('claude-opus-5');
    expect(meta.effort, 'モデルを見送るのであって、行ごと落とすのではない').toBe('xhigh');
    expect(meta.current).toBe('responding');
  });

  it('題を持たない ai-title の行は、先に見えた ai-title を取り消す', () => {
    const lines = jsonl(
      { type: 'user', cwd: '/w', message: { content: '最初の依頼' } },
      { type: 'ai-title', aiTitle: 'ai が付けた題' },
      { type: 'ai-title' },
    );
    expect(
      parseSessionMeta(lines, '').title,
      '題の無い ai-title は「題が付いていない」ことを表すので、最初の発話へ戻る',
    ).toBe('最初の依頼');
  });

  it('状態を語らない行は、直前の状態を消さない', () => {
    const lines = jsonl(
      {
        type: 'assistant',
        cwd: '/w',
        message: { content: [{ type: 'text', text: 'a' }] },
      },
      { type: 'user', message: { content: '次の依頼' } },
      { type: 'assistant', message: { content: [] } },
    );
    const meta = parseSessionMeta(lines, '');
    expect(meta.current, '状態は「最後に見えたもの」であって「最後の行のもの」ではない').toBe(
      'responding',
    );
    expect(meta.lastEventShape, 'ブロックが 1 つも無い行では末尾の形も決まらない').toBe('user');
  });

  it('`tool_result` でない user の行は、待ちにならない形として数える', () => {
    const meta = parseSessionMeta(
      jsonl({ type: 'user', cwd: '/w', message: { content: '依頼' } }),
      '',
    );
    expect(meta.lastEventShape).toBe('user');
    expect(meta.awaitingCandidate, '人が書いた直後は自分の番である').toBe(false);
  });

  it('作業ディレクトリが最後まで決まらなくても、起点だけは置かれる', () => {
    const lines = jsonl(
      {
        type: 'user',
        cwd: null,
        timestamp: 't1',
        message: { content: '依頼' },
      },
      { type: 'user', cwd: 42, timestamp: 't2', message: { content: '依頼' } },
    );
    const meta = parseSessionMeta(lines, '');
    expect(meta.cwd).toBeNull();
    expect(meta.startedRaw, '見ているのは欄が在ることだけなので、起点は毎回置き直される').toBe(
      't2',
    );
  });

  it('作業ディレクトリが文字列でない行では起点だけを置き直し、次の行でまた試す', () => {
    const lines = jsonl(
      { type: 'user', cwd: 42, timestamp: 't1', message: { content: '依頼' } },
      {
        type: 'user',
        cwd: null,
        timestamp: 't2',
        message: { content: '依頼' },
      },
      {
        type: 'user',
        cwd: '/work/myproj',
        timestamp: 't3',
        message: { content: '依頼' },
      },
    );
    const meta = parseSessionMeta(lines, '');
    expect(meta.cwd).toBe('/work/myproj');
    expect(meta.startedRaw, '作業ディレクトリと起点は同じ行から採らないと両者が繋がらない').toBe(
      't3',
    );
  });

  it('題は最初に読めた発話が残る', () => {
    const lines = jsonl(
      {
        type: 'user',
        cwd: '/w',
        message: { content: '<command-name>/foo</command-name>' },
      },
      {
        type: 'user',
        cwd: '/w',
        message: { content: 'Caveat: 注意書き\n本当の依頼' },
      },
      { type: 'user', cwd: '/w', message: { content: '後の発話' } },
    );
    expect(
      parseSessionMeta(lines, '').title,
      '後の発話で塗り替えると何のセッションか分からなくなる',
    ).toBe('本当の依頼');
  });

  it('ブランチは user と assistant の行からだけ、最後に見えたものを採る', () => {
    const lines = jsonl({
      type: 'user',
      cwd: '/w',
      gitBranch: 'main',
      message: { content: '依頼' },
    });
    const tail = jsonl(
      { type: 'system', subtype: 'info', gitBranch: 'system-branch' },
      {
        type: 'assistant',
        gitBranch: 'feature',
        message: { content: [{ type: 'text', text: 'a' }] },
      },
    );
    expect(parseSessionMeta(lines, tail).gitBranch).toBe('feature');
  });

  it('壊れた行と記録でない行は飛ばす', () => {
    const lines = `{"type":"user"\n123\nnull\n["a"]\n${jsonl({
      type: 'user',
      cwd: '/w',
      timestamp: 't1',
      message: { content: '依頼' },
    })}`;
    const meta = parseSessionMeta(lines, '');
    expect(meta.cwd, '1 行の壊れでプロジェクトひとつぶんの観測を失ってはいけない').toBe('/w');
    expect(meta.title).toBe('依頼');
  });

  it('何も読めないときは空のメタ情報を返す', () => {
    const meta = parseSessionMeta('', '');
    expect(meta).toEqual({
      title: null,
      startedRaw: null,
      cwd: null,
      gitBranch: null,
      model: null,
      effort: null,
      issues: [],
      current: null,
      awaitingCandidate: false,
      lastEventShape: null,
    });
  });
});

describe('人が書いた一言を取り出す', () => {
  it('中身が文字列ならそのまま読む', () => {
    expect(deriveUserTitle({ message: { content: '依頼' } })).toBe('依頼');
  });

  it('中身が配列なら最初の本文のブロックから読む', () => {
    expect(
      deriveUserTitle({
        message: {
          content: [
            { type: 'thinking', thinking: 'む' },
            { type: 'text', text: '依頼' },
          ],
        },
      }),
    ).toBe('依頼');
  });

  it('最初の本文のブロックが文字列を持たないときは、後ろのブロックを探しに行かない', () => {
    expect(
      deriveUserTitle({
        message: {
          content: [
            { type: 'text', text: 42 },
            { type: 'text', text: '依頼' },
          ],
        },
      }),
      '最初の本文が壊れている行は、題を持たない行として扱う',
    ).toBeUndefined();
  });

  it('タグで始まる行と注意書きの行は飛ばす', () => {
    expect(
      deriveUserTitle({
        message: {
          content: '  <local-command>x</local-command>\nCaveat: 注意\n  依頼  ',
        },
      }),
    ).toBe('依頼');
  });

  it('飛ばした先に何も残らなければ題は無い', () => {
    expect(deriveUserTitle({ message: { content: '<a>\n\nCaveat: 注意' } })).toBeUndefined();
  });

  it('60 文字を超える行は切り詰める', () => {
    const long = 'あ'.repeat(70);
    expect(deriveUserTitle({ message: { content: long } })).toBe(`${'あ'.repeat(60)}…`);
  });
});

describe('Claude Code が付けた題', () => {
  it('aiTitle の欄をそのまま読む', () => {
    expect(deriveAiTitle({ type: 'ai-title', aiTitle: 'タイトルはこれ' })).toBe('タイトルはこれ');
    expect(deriveAiTitle({ type: 'ai-title' })).toBeUndefined();
  });
});

describe('いま何をしているかを組み立てる', () => {
  it('`tool_use` は名前と一言を並べる', () => {
    expect(
      deriveCurrentActivity({
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/w/a.ts' } }],
        },
      }),
    ).toBe('Read: /w/a.ts');
  });

  it('一言は決められた順で最初に見つかった欄から採る', () => {
    expect(
      deriveCurrentActivity({
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Bash',
              input: { query: 'q', command: 'ls' },
            },
          ],
        },
      }),
      'description の次は command で、query はそれより後に見る',
    ).toBe('Bash: ls');
  });

  it('名前も一言も無いツールは既定の名前で並べる', () => {
    expect(deriveCurrentActivity({ message: { content: [{ type: 'tool_use' }] } })).toBe('tool: ');
  });

  it('90 文字を超える一言は切り詰める', () => {
    const current = deriveCurrentActivity({
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'x'.repeat(200) },
          },
        ],
      },
    });
    expect(current, '切るのは名前と繋いだあとの長さで、一言だけの長さではない').toBe(
      `Bash: ${'x'.repeat(84)}…`,
    );
  });

  it('ツールの `input` が記録でなければ一言は空になる', () => {
    expect(
      deriveCurrentActivity({
        message: { content: [{ type: 'tool_use', name: 'Bash', input: 'ls' }] },
      }),
      '`input` が壊れていても、ツールを呼んだことは見せる',
    ).toBe('Bash: ');
  });

  it('本文と考え事はそれぞれ決まった言葉になる', () => {
    expect(
      deriveCurrentActivity({
        message: { content: [{ type: 'text', text: 'a' }] },
      }),
    ).toBe('responding');
    expect(
      deriveCurrentActivity({
        message: { content: [{ type: 'thinking', thinking: 'む' }] },
      }),
    ).toBe('thinking');
  });

  it('知らない種別のブロックは飛ばして、更に手前を見る', () => {
    expect(
      deriveCurrentActivity({
        message: {
          content: [
            { type: 'text', text: 'a' },
            { type: 'image', source: {} },
          ],
        },
      }),
      '状態を語らないブロックで止まると、いま何をしているかが空になる',
    ).toBe('responding');
  });

  it('中身が配列でなければ状態は無い', () => {
    expect(deriveCurrentActivity({ message: { content: 'a' } })).toBeUndefined();
    expect(deriveCurrentActivity({})).toBeUndefined();
  });
});

describe('末尾の形を読む', () => {
  it('問いかけのツールだけは ask として数える', () => {
    expect(
      classifyLastEvent({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'AskUserQuestion' }] },
      }),
    ).toBe('ask');
    expect(
      classifyLastEvent({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash' }] },
      }),
    ).toBe('tool');
  });

  it('種別を持つ最後のブロックで判断を止める', () => {
    expect(
      classifyLastEvent({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'a' }, { type: 'image' }] },
      }),
      '知らない種別も「そこで話が終わっている」ことに変わりはない',
    ).toBeNull();
  });

  it('種別の欄が空のブロックは最後のブロックとみなさない', () => {
    expect(
      classifyLastEvent({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'a' }, { type: '' }] },
      }),
    ).toBe('text');
  });

  it('形が決まらない行では null を返す', () => {
    expect(classifyLastEvent({ type: 'ai-title', aiTitle: 'x' })).toBeNull();
    expect(classifyLastEvent({ type: 'assistant', message: { content: 'a' } })).toBeNull();
    expect(classifyLastEvent({ type: 'system', subtype: 'info' })).toBeNull();
  });
});

describe('子のメタ情報を導き出す', () => {
  const head = jsonl(
    {
      type: 'user',
      cwd: '/work/myproj/.worktrees/foo-123',
      timestamp: '2026-08-04T00:00:10Z',
      gitBranch: 'mgr-x/foo-123',
      message: { role: 'user', content: '委譲された作業' },
    },
    {
      type: 'assistant',
      effort: 'low',
      message: {
        model: 'claude-haiku-5',
        content: [{ type: 'text', text: 'a' }],
      },
    },
  );
  const tail = jsonl({
    type: 'assistant',
    effort: 'xhigh',
    gitBranch: 'mgr-x/foo-999',
    message: {
      model: 'claude-opus-5',
      content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/w/a.ts' } }],
    },
  });

  it('先頭の 1 行から起点と作業ディレクトリとブランチを採る', () => {
    const meta = parseSubagentMeta(head, null);
    expect(meta.startedRaw).toBe('2026-08-04T00:00:10Z');
    expect(meta.cwd).toBe('/work/myproj/.worktrees/foo-123');
    expect(meta.gitBranch).toBe('mgr-x/foo-123');
  });

  it('取り組んでいる課題は作業ディレクトリのパスから引く', () => {
    expect(parseSubagentMeta(head, null).issue).toBe('foo-123');
    const plain = jsonl({ type: 'user', cwd: '/work/myproj', timestamp: 't1' });
    expect(parseSubagentMeta(plain, null).issue).toBeNull();
  });

  it('稼働していない子には `tail` を渡さないので、末尾のモデルが反映されない', () => {
    const meta = parseSubagentMeta(head, null);
    expect(meta.model, '止まった子は `head` を読めば足りる').toBe('claude-haiku-5');
    expect(meta.effort).toBe('low');
    expect(meta.gitBranch).toBe('mgr-x/foo-123');
    expect(meta.current, '止まった子に「いま」は無い').toBeNull();
  });

  it('稼働している子は `tail` で見えたもので上書きする', () => {
    const meta = parseSubagentMeta(head, tail);
    expect(meta.model).toBe('claude-opus-5');
    expect(meta.effort).toBe('xhigh');
    expect(meta.gitBranch).toBe('mgr-x/foo-999');
    expect(meta.current).toBe('Read: /w/a.ts');
    expect(meta.startedRaw, '起点は先頭の行で決まり、`tail` では動かない').toBe(
      '2026-08-04T00:00:10Z',
    );
  });

  it('`head` のモデルとエフォートは最初に見えたものを採る', () => {
    const lines = jsonl(
      { type: 'user', cwd: '/w', timestamp: 't1' },
      {
        type: 'assistant',
        effort: 'low',
        message: { model: 'claude-haiku-5', content: [] },
      },
      {
        type: 'assistant',
        effort: 'xhigh',
        message: { model: 'claude-opus-5', content: [] },
      },
    );
    const meta = parseSubagentMeta(lines, null);
    expect(meta.model, 'モデルは委譲のときに固定される').toBe('claude-haiku-5');
    expect(meta.effort).toBe('low');
  });

  it('`head` では <synthetic> のモデルだけを見送り、エフォートは採る', () => {
    const lines = jsonl(
      { type: 'user', cwd: '/w', timestamp: 't1' },
      {
        type: 'assistant',
        effort: 'xhigh',
        message: { model: '<synthetic>', content: [] },
      },
      {
        type: 'assistant',
        effort: 'low',
        message: { model: 'claude-opus-5', content: [] },
      },
    );
    const meta = parseSubagentMeta(lines, null);
    expect(meta.model).toBe('claude-opus-5');
    expect(meta.effort, 'エフォートは合成メッセージの行でも読める').toBe('xhigh');
  });

  it('`head` が行の途中で切れていても、読める行までは採る', () => {
    const cut = `${head}{"type":"assistant","message":{"mod`;
    const meta = parseSubagentMeta(cut, null);
    expect(meta.model).toBe('claude-haiku-5');
    expect(meta.cwd).toBe('/work/myproj/.worktrees/foo-123');
  });

  it('先頭の行が読めなくても、続く行からモデルは採る', () => {
    const broken = `{"type":"user","cwd":\n${jsonl({
      type: 'assistant',
      effort: 'low',
      message: { model: 'claude-haiku-5', content: [] },
    })}`;
    const meta = parseSubagentMeta(broken, null);
    expect(meta.cwd, '起点の行が読めない子も、メタ無しで載せる').toBeNull();
    expect(meta.model).toBe('claude-haiku-5');
  });

  it('`tail` でも <synthetic> のモデルだけを見送る', () => {
    const other = jsonl({
      type: 'assistant',
      effort: 'xhigh',
      message: { model: '<synthetic>', content: [{ type: 'text', text: 'a' }] },
    });
    const meta = parseSubagentMeta(head, other);
    expect(meta.model, '合成メッセージの目印はモデルの名前ではない').toBe('claude-haiku-5');
    expect(meta.effort, 'モデルを見送るのであって、行ごと落とすのではない').toBe('xhigh');
    expect(meta.current).toBe('responding');
  });

  it('`tail` のブランチは行の種別を問わず、最後に見えたものを採る', () => {
    const other = jsonl({
      type: 'system',
      subtype: 'info',
      gitBranch: 'mgr-x/foo-777',
    });
    expect(parseSubagentMeta(head, other).gitBranch).toBe('mgr-x/foo-777');
  });

  it('何も読めないときは空のメタ情報を返す', () => {
    expect(parseSubagentMeta('', null)).toEqual({
      startedRaw: null,
      cwd: null,
      gitBranch: null,
      model: null,
      effort: null,
      current: null,
      issue: null,
    });
  });
});
