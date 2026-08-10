import { describe, expect, it } from 'vitest';
import {
  githubTrouble,
  gitTrouble,
  transportTrouble,
} from '~/frameworks/tanstack/ui/derive/trouble.ts';

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
  null,
] as const;

const GIT_CODES = ['git.not_installed', 'git.denied', 'git.timeout', null] as const;

describe('GitHub を尋ねに行けなかったとき', () => {
  /* 入れる話と、入り直す話は、ユーザーのすべきことが違う。 */
  it('入っていないのと、断られたのとを、別の案内にする', () => {
    const missing = githubTrouble('tracker.not_installed');
    const denied = githubTrouble('tracker.denied');

    expect(missing.title).not.toBe(denied.title);
    expect(missing.detail).not.toBe(denied.detail);
    expect(
      commandsOf(missing),
      '入っていない機械で `gh auth status` を打たせても、何も分からない',
    ).not.toEqual(commandsOf(denied));
  });

  it('入っていないときは、入れる先を出す', () => {
    const props = githubTrouble('tracker.not_installed');

    expect(linksOf(props), '入れる話なのだから、入れる先が要る').toContain(
      'https://cli.github.com',
    );
  });

  it('断られたときは、入り直す手立てを出す', () => {
    expect(commandsOf(githubTrouble('tracker.denied'))).toContain('gh auth login');
  });

  it('時間切れを、断られたのと同じ案内にしない', () => {
    const props = githubTrouble('tracker.timeout');

    expect(props.title, '待つ話と、入り直す話は違う').not.toBe(
      githubTrouble('tracker.denied').title,
    );
    expect(props.code).toBe('tracker.timeout');
  });

  it('知らないコードでも落ちず、そのコードをそのまま見せる', () => {
    const props = githubTrouble('tracker.rate_limited');

    expect(props.code, '当たらない案内で時間を使わせるより、調べられる語を出す').toBe(
      'tracker.rate_limited',
    );
    expect(props.steps, '知らないコードに手立ては添えない').toBeUndefined();
  });

  it('コードが読めなくても落ちない', () => {
    expect(githubTrouble(null).code).toBe(null);
  });

  it('どのコードでも、渡したコードをそのまま持つ', () => {
    for (const code of GITHUB_CODES) {
      expect(githubTrouble(code).code, '案内が当たらなかったときに、その語で調べられる').toBe(code);
    }
  });
});

describe('`git` を見に行けなかったとき', () => {
  it('入っていないときは、入れる先を出す', () => {
    expect(linksOf(gitTrouble('git.not_installed'))).toContain('https://git-scm.com/downloads');
  });

  it('断られたときは、`git` に理由を尋ねさせる', () => {
    expect(commandsOf(gitTrouble('git.denied'))).toContain('git status');
  });

  it('知らないコードでも落ちず、そのコードをそのまま見せる', () => {
    expect(gitTrouble('git.locked').code).toBe('git.locked');
    expect(gitTrouble('git.locked').steps).toBeUndefined();
  });

  it('どのコードでも、渡したコードをそのまま持つ', () => {
    for (const code of GIT_CODES) {
      expect(gitTrouble(code).code).toBe(code);
    }
  });
});

describe('`git` と GitHub の案内が混ざらない', () => {
  it('GitHub の案内に、`git` のコマンドは出てこない', () => {
    for (const code of GITHUB_CODES) {
      expect(
        commandsOf(githubTrouble(code)).filter((command) => command.startsWith('git ')),
      ).toEqual([]);
    }
  });

  it('`git` の案内に、`gh` のコマンドは出てこない', () => {
    for (const code of GIT_CODES) {
      expect(commandsOf(gitTrouble(code)).filter((command) => command.startsWith('gh '))).toEqual(
        [],
      );
    }
  });

  /* 表を引き違えると、`git` が読めないときに GitHub へ入り直させることになる。 */
  it('相手のエラーコードを渡しても、自分の表の中に留まる', () => {
    expect(gitTrouble('tracker.not_installed').title).not.toBe(
      githubTrouble('tracker.not_installed').title,
    );
    expect(gitTrouble('tracker.not_installed').icon, 'アイコンも `git` の側のまま').toBe(
      gitTrouble('git.timeout').icon,
    );
    expect(githubTrouble('git.not_installed').title).not.toBe(
      gitTrouble('git.not_installed').title,
    );
  });
});

describe('呼び出しそのものが届かなかったとき', () => {
  const props = transportTrouble('issues');

  it('`gh` や `git` の案内を出さない', () => {
    expect(commandsOf(props), '届かなかったのはこちら側の話で、直す先が違う').toEqual([]);
    expect(props.icon).not.toBe(githubTrouble('tracker.not_installed').icon);
    expect(props.icon).not.toBe(gitTrouble('git.not_installed').icon);
  });

  it('何を尋ねに行ったのかを、題に残す', () => {
    expect(props.title).toContain('issues');
  });

  it('エラーコードは添えない', () => {
    expect(props.code, 'サーバーが答えていないのだから、見せられるコードは無い').toBeUndefined();
  });
});
