import { describe, expect, it } from 'vitest';
import {
  githubTrouble,
  gitTrouble,
  transportTrouble,
} from '~/frameworks/tanstack/ui/derive/trouble.ts';
import { defaultTranslator as t } from '~/frameworks/tanstack/ui/i18n/useT.ts';

/* 観測できなかったことを、読める言葉に直す。

   **エラーコードごとに、ユーザーのすべきことが違う。** 同じ「読めませんでした」に潰すと、
   自分が何をすればいいのか分からないまま画面の前に取り残される。 */

/* 案内の形は、直す実装そのものから引く。写して持てば、形が変わったときに片方だけ古いまま残る */
type Trouble = ReturnType<typeof gitTrouble>;

/** 案内に出てくるコマンドだけを取り出す */
const commandsOf = (props: Trouble): string[] =>
  (props.steps ?? []).flatMap((step) => (step.command === undefined ? [] : [step.command]));

/** 案内に出てくるリンク先だけを取り出す */
const linksOf = (props: Trouble): string[] =>
  (props.steps ?? []).flatMap((step) => (step.href === undefined ? [] : [step.href]));

const GITHUB_CODES = [
  'tracker.not_installed',
  'tracker.denied',
  'tracker.timeout',
  'tracker.exit_nonzero',
  'tracker.unreadable_response',
  null,
] as const;

const GIT_CODES = [
  'git.not_installed',
  'git.denied',
  'git.timeout',
  'git.exit_nonzero',
  null,
] as const;

describe('GitHub を尋ねに行けなかったとき', () => {
  /* 入れる話と、入り直す話は、ユーザーのすべきことが違う。 */
  it('入っていないのと、断られたのとを、別の案内にする', () => {
    const missing = githubTrouble(t, 'tracker.not_installed');
    const denied = githubTrouble(t, 'tracker.denied');

    expect(missing.title).not.toBe(denied.title);
    expect(missing.detail).not.toBe(denied.detail);
    expect(
      commandsOf(missing),
      '入っていない機械で `gh auth status` を打たせても、何も分からない',
    ).not.toEqual(commandsOf(denied));
  });

  it('入っていないときは、入れる先を出す', () => {
    const props = githubTrouble(t, 'tracker.not_installed');

    expect(linksOf(props), '入れる話なのだから、入れる先が要る').toContain(
      'https://cli.github.com',
    );
  });

  it('断られたときは、入り直す手立てを出す', () => {
    expect(commandsOf(githubTrouble(t, 'tracker.denied'))).toContain('gh auth login');
  });

  it('時間切れを、断られたのと同じ案内にしない', () => {
    const props = githubTrouble(t, 'tracker.timeout');

    expect(props.title, '待つ話と、入り直す話は違う').not.toBe(
      githubTrouble(t, 'tracker.denied').title,
    );
    expect(props.code).toBe('tracker.timeout');
  });

  /* `gh` は答えている。「GitHub へ届かなかった」と言うと、繋がりを疑わせて、
     入り直せば済む人を遠回りさせる。 */
  it('読めない答えが返ったのを、届かなかったのと同じ案内にしない', () => {
    const props = githubTrouble(t, 'tracker.unreadable_response');

    expect(props.title, '`gh` は答えているのに、届かなかったことにしている').not.toBe(
      githubTrouble(t, null).title,
    );
    expect(
      commandsOf(props),
      'いちばん多い引き金は認証切れで、手立てが 1 つも出ないと調べる先が無い',
    ).toContain('gh auth login');
    expect(props.detail, '答えが読めなかったことを、課題が無いことにしている').toContain(
      'not an empty backlog',
    );
  });

  it('知らないコードでも落ちず、そのコードをそのまま見せる', () => {
    const props = githubTrouble(t, 'tracker.rate_limited');

    expect(props.code, '当たらない案内で時間を使わせるより、調べられる語を出す').toBe(
      'tracker.rate_limited',
    );
    expect(props.steps, '知らないコードに手立ては添えない').toBeUndefined();
  });

  it('コードが読めなくても落ちない', () => {
    expect(githubTrouble(t, null).code).toBe(null);
  });

  it('どのコードでも、渡したコードをそのまま持つ', () => {
    for (const code of GITHUB_CODES) {
      expect(githubTrouble(t, code).code, '案内が当たらなかったときに、その語で調べられる').toBe(
        code,
      );
    }
  });
});

describe('`git` を見に行けなかったとき', () => {
  it('入っていないときは、入れる先を出す', () => {
    expect(linksOf(gitTrouble(t, 'git.not_installed'))).toContain('https://git-scm.com/downloads');
  });

  it('断られたときは、`git` に理由を尋ねさせる', () => {
    expect(commandsOf(gitTrouble(t, 'git.denied'))).toContain('git status');
  });

  /* `git` は、そこがリポジトリでないときも、所有者が違って断るときも 128 で終わる。
     案内まで同じにすると、既に在るリポジトリへ `git init` を勧めることになる。 */
  it('断られたのと、リポジトリが無いのを、別の案内にする', () => {
    const denied = gitTrouble(t, 'git.denied');

    expect(denied.title, '断ったのは `git` で、リポジトリはそこに在る').toBe(
      'git refused to read this repository',
    );
    expect(
      commandsOf(denied).some((command) => command.startsWith('git init')),
      '既に在るリポジトリを作らせる案内は、直す先を間違えさせる',
    ).toBe(false);
    expect(
      commandsOf(denied).some((command) => command.includes('safe.directory')),
      '所有者の違うリポジトリを読ませるのは、この設定だけである',
    ).toBe(true);
  });

  it('理由の読めない非ゼロは、自分で起こして確かめさせる', () => {
    const props = gitTrouble(t, 'git.exit_nonzero');

    expect(props.title, '断られたのと同じ案内にすると、当たらない手立てで時間を使わせる').not.toBe(
      gitTrouble(t, 'git.denied').title,
    );
    expect(commandsOf(props), '理由は `git` だけが知っている').toContain('git status');
  });

  it('知らないコードでも落ちず、そのコードをそのまま見せる', () => {
    expect(gitTrouble(t, 'git.locked').code).toBe('git.locked');
    expect(gitTrouble(t, 'git.locked').steps).toBeUndefined();
  });

  it('どのコードでも、渡したコードをそのまま持つ', () => {
    for (const code of GIT_CODES) {
      expect(gitTrouble(t, code).code).toBe(code);
    }
  });
});

describe('`git` と GitHub の案内が混ざらない', () => {
  it('GitHub の案内に、`git` のコマンドは出てこない', () => {
    for (const code of GITHUB_CODES) {
      expect(
        commandsOf(githubTrouble(t, code)).filter((command) => command.startsWith('git ')),
      ).toEqual([]);
    }
  });

  it('`git` の案内に、`gh` のコマンドは出てこない', () => {
    for (const code of GIT_CODES) {
      expect(
        commandsOf(gitTrouble(t, code)).filter((command) => command.startsWith('gh ')),
      ).toEqual([]);
    }
  });

  /* 表を引き違えると、`git` が読めないときに GitHub へ入り直させることになる。 */
  it('相手のエラーコードを渡しても、自分の表の中に留まる', () => {
    expect(gitTrouble(t, 'tracker.not_installed').title).not.toBe(
      githubTrouble(t, 'tracker.not_installed').title,
    );
    expect(gitTrouble(t, 'tracker.not_installed').icon, 'アイコンも `git` の側のまま').toBe(
      gitTrouble(t, 'git.timeout').icon,
    );
    expect(githubTrouble(t, 'git.not_installed').title).not.toBe(
      gitTrouble(t, 'git.not_installed').title,
    );
  });
});

describe('呼び出しそのものが届かなかったとき', () => {
  const props = transportTrouble(t, 'issues');

  it('`gh` や `git` の案内を出さない', () => {
    expect(commandsOf(props), '届かなかったのはこちら側の話で、直す先が違う').toEqual([]);
    expect(props.icon).not.toBe(githubTrouble(t, 'tracker.not_installed').icon);
    expect(props.icon).not.toBe(gitTrouble(t, 'git.not_installed').icon);
  });

  it('何を尋ねに行ったのかを、題に残す', () => {
    expect(props.title).toContain('issues');
  });

  it('エラーコードは添えない', () => {
    expect(props.code, 'サーバーが答えていないのだから、見せられるコードは無い').toBeUndefined();
  });
});
