import { describe, expect, it } from 'vitest';
import { parseRemoteConfig, parseRemoteUrl } from '~/domain/services/git/remote-parsing.service.ts';

describe('remote の URL を読む', () => {
  it.each([
    ['git@github.com:hiroiku/glasshive.git', 'github.com', 'hiroiku', 'glasshive'],
    ['git@github.com:hiroiku/glasshive', 'github.com', 'hiroiku', 'glasshive'],
    ['ssh://git@github.com/hiroiku/glasshive.git', 'github.com', 'hiroiku', 'glasshive'],
    ['https://github.com/hiroiku/glasshive.git', 'github.com', 'hiroiku', 'glasshive'],
    ['https://github.com/hiroiku/glasshive', 'github.com', 'hiroiku', 'glasshive'],
    ['git://github.com/hiroiku/glasshive.git', 'github.com', 'hiroiku', 'glasshive'],
    ['git@github.example.com:team/tool.git', 'github.example.com', 'team', 'tool'],
  ])('%s を読む', (url, host, owner, name) => {
    expect(parseRemoteUrl(url)).toEqual({ host, owner, name });
  });

  it('資格情報を持ち帰らない', () => {
    expect(
      parseRemoteUrl('https://someone:ghp_secret@github.com/hiroiku/glasshive.git'),
      'ホストの一部として持ち帰ると、画面にもエラーにもトークンがそのまま出る',
    ).toEqual({ host: 'github.com', owner: 'hiroiku', name: 'glasshive' });
  });

  it('ポートを落とす', () => {
    expect(parseRemoteUrl('ssh://git@github.example.com:2222/team/tool.git')).toEqual({
      host: 'github.example.com',
      owner: 'team',
      name: 'tool',
    });
  });

  it('ホストの後ろの数字を、ポートとパスで取り違えない', () => {
    expect(
      parseRemoteUrl('ssh://git@github.com:22/hiroiku/glasshive.git'),
      '22 を owner として読むと、存在しないリポジトリを尋ねに行く',
    ).toEqual({ host: 'github.com', owner: 'hiroiku', name: 'glasshive' });
  });

  it('入れ子のグループは、名前の 1 つ手前を owner にする', () => {
    expect(parseRemoteUrl('https://gitlab.com/group/sub/tool.git')).toEqual({
      host: 'gitlab.com',
      owner: 'sub',
      name: 'tool',
    });
  });

  it('大文字のホストをそろえる', () => {
    expect(parseRemoteUrl('https://GitHub.com/hiroiku/glasshive.git')?.host).toBe('github.com');
  });

  it.each([
    ['', '空の remote'],
    ['   ', '空白だけ'],
    ['/srv/repos/tool.git', 'ホストを持たないパス'],
    ['file:///srv/repos/tool.git', 'ホストを持たないスキーム'],
    ['https://github.com/hiroiku', 'owner しか無い'],
    ['not a url at all', '読めない文字列'],
  ])('%s は場所として読めない(%s)', (url) => {
    expect(parseRemoteUrl(url), '読めないことは失敗ではない。ただ場所ではない').toBeNull();
  });
});

describe('remote の設定を読む', () => {
  it('remote ごとにまとめる', () => {
    expect(
      parseRemoteConfig(
        [
          'remote.origin.url git@github.com:me/my-fork.git',
          'remote.origin.gh-resolved base',
          'remote.upstream.url https://github.com/them/the-tool.git',
        ].join('\n'),
      ),
    ).toEqual([
      { name: 'origin', url: 'git@github.com:me/my-fork.git', ghResolved: 'base' },
      { name: 'upstream', url: 'https://github.com/them/the-tool.git', ghResolved: null },
    ]);
  });

  it('書かれている順のまま返す', () => {
    expect(
      parseRemoteConfig(
        ['remote.zeta.url git@github.com:z/z.git', 'remote.alpha.url git@github.com:a/a.git'].join(
          '\n',
        ),
      ).map((remote) => remote.name),
      'どれを本命と見るかを決めるのは呼ぶ側で、その決め方に並びが入ることがある',
    ).toEqual(['zeta', 'alpha']);
  });

  it('remote 以外の設定は読まない', () => {
    expect(
      parseRemoteConfig(
        ['user.email me@example.com', 'remote.origin.url git@github.com:me/tool.git'].join('\n'),
      ).map((remote) => remote.name),
    ).toEqual(['origin']);
  });

  it('名前にドットを含む remote も 1 つとして読む', () => {
    expect(parseRemoteConfig('remote.my.fork.url git@github.com:me/tool.git')).toEqual([
      { name: 'my.fork', url: 'git@github.com:me/tool.git', ghResolved: null },
    ]);
  });

  it('何も設定されていない出力は、remote が無いこと', () => {
    expect(parseRemoteConfig('')).toEqual([]);
  });
});
