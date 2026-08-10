import { describe, expect, it } from 'vitest';
import { Revision, RevisionRange } from '~/domain/value-objects/git/revision.value-object.ts';

/* ここが通ると、外から来た文字列が `git` のオプションに化ける経路が閉じる。
 **形式の検証を緩めると、`--upload-pack` の差し替えまで通ってしまう。** */

const REFUSED = [
  ['`git` のオプション', '--upload-pack=/tmp/evil'],
  ['短いオプション', '-x'],
  ['シェルのコマンド区切り', 'main;rm -rf /'],
  ['空', ''],
  ['空白だけ', ' '],
  ['前に空白が付いた名', ' main'],
  ['記号で始まる名', '.hidden'],
  ['パス区切りで始まる名', '/etc/passwd'],
  ['改行を挟んだ名', 'main\n--upload-pack=x'],
  ['波括弧を含む名', 'main@{upstream}'],
] as const;

const ACCEPTED = ['main', 'HEAD', 'feature/add-git-2', 'v1.0.0', '9f8e7d6c5b', 'a.b_c'] as const;

describe('リクエストと共に来た revision', () => {
  for (const [what, raw] of REFUSED) {
    it(`${what}は断る`, () => {
      const created = Revision.create(raw);
      expect(created.ok, '検証を抜けた文字列は、そのまま `git` のオプションとして読まれる').toBe(
        false,
      );
    });
  }

  for (const raw of ACCEPTED) {
    it(`${raw} は通す`, () => {
      const created = Revision.create(raw);
      expect(created.ok, '普通のブランチ名まで断ると、観られるはずのものが観られなくなる').toBe(
        true,
      );
      if (created.ok) expect(created.value.value, '通した文字列はそのまま渡る').toBe(raw);
    });
  }

  it('断ったときのエラーコードは git.invalid_revision', () => {
    const created = Revision.create('--upload-pack=x');
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(
      created.error.code,
      'エラーコードで 400 と決まる。ここが変わると、リクエストの側の誤りが観測できなかった扱いになる',
    ).toBe('git.invalid_revision');
  });

  it('断った文字列は外へ返すエラーメッセージに載せない', () => {
    const created = Revision.create('--upload-pack=x');
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(
      created.error.message.includes('--upload-pack'),
      'リクエストの文字列をそのままメッセージに載せると、レスポンスに外から来た文字列が混ざる',
    ).toBe(false);
    expect(created.error.details, '後から追えるように、文字列そのものは内側に残す').toEqual({
      raw: '--upload-pack=x',
    });
  });
});

describe('git 自身が答えた revision', () => {
  it('形を問わずに通す', () => {
    expect(
      Revision.fromGitOutput('feature/+odd').value,
      'git が作れる名をこちらで断ると、観測が理由もなく欠ける',
    ).toBe('feature/+odd');
  });
});

describe('revision の範囲', () => {
  it('..(片側のコミット)', () => {
    const range = RevisionRange.between(
      Revision.fromGitOutput('main'),
      Revision.fromGitOutput('topic'),
    );
    expect(range.value, '向きが逆になると、先と遅れが入れ替わる').toBe('main..topic');
  });

  it('...(分かれ目からの差)', () => {
    const range = RevisionRange.sinceFork(
      Revision.fromGitOutput('main'),
      Revision.fromGitOutput('topic'),
    );
    expect(range.value, '2 点にすると、本流が進んだぶんまで自分の差分として数える').toBe(
      'main...topic',
    );
  });
});
