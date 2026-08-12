import { describe, expect, it } from 'vitest';
import { type CliEnvironment, parseArgs } from '~/frameworks/node/cli.ts';

/* 打った引数の読み方。

   ここで黙って既定に倒すと、指定が効いていないことに気づけないまま観ることになる。
   **とくにパスは、打ち間違いをその場で言う。** 開いてから「何も無い」と言うと、観測した
   結果として何も無かったのか、そもそも別の場所を開いたのかが読み分けられない。 */

const HOME = '/home/dev';

/** ディレクトリが在ることにする相手。本物のファイルは 1 つも置かない */
const environment = (directories: readonly string[]): CliEnvironment => ({
  cwd: HOME,
  isDirectory: (path) => directories.includes(path),
});

describe('打った引数', () => {
  it('パスを渡さなければ、開く先も待つポートも決めない', () => {
    const parsed = parseArgs([], environment([]));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.target, 'パスを渡していないのに開く先が決まると、Overview が開かない').toBe(
      undefined,
    );
    expect(
      parsed.args.port,
      '既定のポートをここで決めると、埋まっていても次の空きへ落とせない',
    ).toBe(undefined);
  });

  it('相対パスは、打った場所から絶対パスに直す', () => {
    const parsed = parseArgs(['./work/repo'], environment([`${HOME}/work/repo`]));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.target).toBe(`${HOME}/work/repo`);
  });

  it('絶対パスはそのまま受け取る', () => {
    const parsed = parseArgs(['/srv/other'], environment(['/srv/other']));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.target).toBe('/srv/other');
  });

  /* 開けないパスを受け取って開いてしまうと、画面は「セッションが無かった」と言う。
     観測の結果として何も無かったのか、打ち間違いなのかが、そこからは読めない。 */
  it('ディレクトリでないパスは、開く前に断る', () => {
    const parsed = parseArgs(['./typo'], environment([`${HOME}/work/repo`]));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('not a directory: ./typo');
    expect(parsed.exitCode).toBe(2);
  });

  /* 2 つ渡されて片方だけを開くと、どちらを開いたのかは画面からしか分からない。 */
  it('パスは 1 つだけ受け取る', () => {
    const parsed = parseArgs(['/srv/a', '/srv/b'], environment(['/srv/a', '/srv/b']));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('/srv/a');
    expect(parsed.message).toContain('/srv/b');
  });

  it('オプションと混ぜても、パスはパスとして読む', () => {
    const parsed = parseArgs(['--no-open', '/srv/a', '--port', '5000'], environment(['/srv/a']));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.target).toBe('/srv/a');
    expect(parsed.args.port).toBe(5000);
    expect(parsed.args.open).toBe(false);
  });

  it('知らないオプションは断る', () => {
    const parsed = parseArgs(['--deep'], environment([]));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('unknown option: --deep');
  });
});
