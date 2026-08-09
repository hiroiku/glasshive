import { describe, expect, it } from 'vitest';
import { Revision, RevisionRange } from '~/domain/value-objects/git/revision.value-object.ts';

/* ここが通ると、外から来た字が git の指定に化ける道が閉じる。
 **形の確かめを緩めると、外の道具の差し替えまで通る。** */

const REFUSED = [
  ['外の道具の指定', '--upload-pack=/tmp/evil'],
  ['短い指定', '-x'],
  ['続けて起こす区切り', 'main;rm -rf /'],
  ['空', ''],
  ['空白だけ', ' '],
  ['前に空白が付いた名', ' main'],
  ['記号で始まる名', '.hidden'],
  ['道の区切りで始まる名', '/etc/passwd'],
  ['改行を挟んだ名', 'main\n--upload-pack=x'],
  ['波括弧を含む名', 'main@{upstream}'],
] as const;

const ACCEPTED = ['main', 'HEAD', 'feature/add-git-2', 'v1.0.0', '9f8e7d6c5b', 'a.b_c'] as const;

describe('求めと共に来た指し', () => {
  for (const [what, raw] of REFUSED) {
    it(`${what}は断る`, () => {
      const created = Revision.create(raw);
      expect(created.ok, '確かめを抜けた字は、そのまま外の道具の指定として読まれる').toBe(false);
    });
  }

  for (const raw of ACCEPTED) {
    it(`${raw} は通す`, () => {
      const created = Revision.create(raw);
      expect(created.ok, '普通の枝の名まで断ると、観られるはずのものが観られなくなる').toBe(true);
      if (created.ok) expect(created.value.value, '通した字はそのまま渡る').toBe(raw);
    });
  }

  it('断ったときの名札は git.invalid_revision', () => {
    const created = Revision.create('--upload-pack=x');
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(
      created.error.code,
      '名札で 400 と決まる。ここが変わると求めの側の誤りが見に行けなかった扱いになる',
    ).toBe('git.invalid_revision');
  });

  it('断った字は外へ出す言い分に載せない', () => {
    const created = Revision.create('--upload-pack=x');
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(
      created.error.message.includes('--upload-pack'),
      '求めの字をそのまま言い分に載せると、外へ返す包みに外から来た字が混ざる',
    ).toBe(false);
    expect(created.error.details, '後から追えるように、字そのものは内側に残す').toEqual({
      raw: '--upload-pack=x',
    });
  });
});

describe('git 自身が答えた指し', () => {
  it('形を問わずに通す', () => {
    expect(
      Revision.fromGitOutput('feature/+odd').value,
      'git が作れる名をこちらで断ると、観測が理由もなく欠ける',
    ).toBe('feature/+odd');
  });
});

describe('隔たりの指し', () => {
  it('..(片側の記録)', () => {
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
