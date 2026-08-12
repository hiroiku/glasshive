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

/* サーバーは 1 つに保つので、居場所を訊く手段と終わらせる手段が要る。**どちらもサーバーを
   立てない。** 立てる側と同じ手順を通すと、止めに来たコマンドが 2 枚目を立てて終わる。 */
describe('走っているものへの求め', () => {
  it('何も渡さなければ、立ち上げに来たものとして読む', () => {
    const parsed = parseArgs([], environment([]));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.action).toBe('serve');
  });

  it.each([
    ['--status', 'status'],
    ['--stop', 'stop'],
  ])('%s は、立ち上げずに尋ねる求めとして読む', (flag, action) => {
    const parsed = parseArgs([flag, '--port', '5000'], environment([]));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.action).toBe(action);
    expect(parsed.args.port, '尋ねる先を名指せなければ、別のポートのものを止めてしまう').toBe(5000);
  });

  /* `glasshive . --stop` を「このディレクトリのぶんだけ止める」と読んだ人に、1 つしかない
     サーバーを止めたことを言わないまま終わってはいけない。 */
  it('パスと一緒には受け取らない', () => {
    const parsed = parseArgs(['/srv/a', '--stop'], environment(['/srv/a']));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('--stop does not take a path: /srv/a');
    expect(parsed.exitCode).toBe(2);
  });

  it('2 つ渡されたら断る', () => {
    const parsed = parseArgs(['--status', '--stop'], environment([]));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message, '居場所を訊いたつもりで止まっていた、が起こる').toContain(
      'only one of --status and --stop',
    );
  });

  it('同じものを 2 度渡されるのは断らない', () => {
    const parsed = parseArgs(['--stop', '--stop'], environment([]));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.action).toBe('stop');
  });
});
