import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '~/app-kernel/error.ts';
import { type Observation, observed } from '~/app-kernel/observation.ts';
import { ProcessInspectionError } from '~/infrastructure/errors/sessions/transcript-read.error.ts';
import { createOsAgentProcessIntegration } from '~/infrastructure/integrations/sessions/os-agent-process.integration.ts';

/* 本物のプロセスは起こさない。`run` を差し替えて、出力のテキストだけを渡す。 */

type Reply = { readonly out: string } | { readonly throws: Error };

interface Call {
  readonly file: string;
  readonly args: readonly string[];
}

function createRun(replies: Readonly<Record<string, Reply>>) {
  const calls: Call[] = [];
  const run = (file: string, args: readonly string[]): string => {
    calls.push({ file, args });
    const reply = replies[file];
    if (reply === undefined) throw new Error(`起こされるはずのないコマンドだった: ${file}`);
    if ('throws' in reply) throw reply.throws;
    return reply.out;
  };
  return { run, calls };
}

/** 観測できなかったときのエラーを取り出す。そうでなければテストを落とす */
function errorOf(observation: Observation<unknown>): AppError {
  if (observation.kind !== 'unobservable') {
    throw new Error(`観測できなかったと言うはずだった: ${observation.kind}`);
  }
  return observation.error;
}

const PS_ARGS = ['-axo', 'pid=,comm='];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ps の出力から claude の `pid` を拾う', () => {
  it('パスつきで出ていても拾う', async () => {
    const { run, calls } = createRun({
      ps: { out: '  101 claude\n  102 /usr/local/bin/claude\n' },
      lsof: { out: 'p101\nn/home/me/a\np102\nn/home/me/b\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(calls[1]?.args, '名前はパスつきで出る機械がある。最後の区切りから後ろを見る').toEqual([
      '-a',
      '-p',
      '101,102',
      '-d',
      'cwd',
      '-Fn',
    ]);
    expect(result).toEqual(
      observed([
        { pid: 101, cwd: '/home/me/a' },
        { pid: 102, cwd: '/home/me/b' },
      ]),
    );
  });

  it('名前が丸ごと一致しないものは拾わない', async () => {
    const { run, calls } = createRun({
      ps: {
        out: [
          '  101 claude',
          '  102 claude-code',
          '  103 myclaude',
          '  104 /opt/claude-code',
          '  105 node',
          '',
        ].join('\n'),
      },
      lsof: { out: 'p101\nn/home/me/a\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      calls[1]?.args[2],
      'claude-code や myclaude は別のプログラム。数に入れると待機が水増しされる',
    ).toBe('101');
    expect(result).toEqual(observed([{ pid: 101, cwd: '/home/me/a' }]));
  });

  it('名前の後ろに言葉が続くものは拾わない', async () => {
    // 実際の macOS で出る表記。claude はヘルパープロセスに別の名前を付けて動かす
    const { run, calls } = createRun({
      ps: {
        out: '35934 claude bg-pty-host\n35943 claude bg-spare\n42888 claude\n',
      },
      lsof: { out: 'p42888\nfcwd\nn/home/me/a\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      calls[1]?.args[2],
      'ヘルパーは本体の子。数に入れると 1 つのプロジェクトが 3 つ動いているように見え、待機が水増しされる',
    ).toBe('42888');
    expect(result).toEqual(observed([{ pid: 42888, cwd: '/home/me/a' }]));
  });

  it('`pid` として読めない行は落とす', async () => {
    const { run, calls } = createRun({
      ps: { out: 'PID COMM\n  101 claude\nclaude\n  x02 claude\n' },
      lsof: { out: 'p101\nn/home/me/a\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(calls[1]?.args[2], '見出しや欠けた行を `pid` として渡すと lsof ごと落ちる').toBe('101');
    expect(result).toEqual(observed([{ pid: 101, cwd: '/home/me/a' }]));
  });

  it('ps を起こせなければ、観測できなかったと言う', async () => {
    const { run, calls } = createRun({
      ps: { throws: new Error('spawn ps ENOENT') },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      result.kind,
      '0 件と答えると待機の枠が消え、待っているセッションが残らず終わったものとして並ぶ',
    ).toBe('unobservable');
    expect(errorOf(result)).toBeInstanceOf(ProcessInspectionError);
    expect(errorOf(result).code, '画面はこのエラーコードを見て「数えられなかった」と言う').toBe(
      'process.uninspectable',
    );
    expect(
      calls.map((c) => c.file),
      'ps が答えていないなら作業ディレクトリを引く相手も分からない',
    ).toEqual(['ps']);
  });

  it('ps が途中まで答えて落ちたら、その分は使わずに観測できなかったと言う', async () => {
    const { run, calls } = createRun({
      ps: {
        throws: Object.assign(new Error('ps: broken pipe'), {
          stdout: '  101 claude\n',
        }),
      },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      result.kind,
      '`pid` の一覧が途中で切れていると claude を数え落とす。少なく数えるのは 0 件と同じ嘘で、' +
        '待機の枠が足りずに待っているセッションが終了へ倒れる。lsof の途中経過とは扱いが違う',
    ).toBe('unobservable');
    expect(
      calls.map((c) => c.file),
      '数え落としたかもしれない `pid` で作業ディレクトリを引いても、結果は埋まらない',
    ).toEqual(['ps']);
  });

  it('ps は答えたが claude が居なければ、0 件と言う', async () => {
    const { run, calls } = createRun({
      ps: { out: '  101 node\n  102 zsh\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result, 'ここだけが本当の 0 件').toEqual(observed([]));
    expect(
      calls.map((c) => c.file),
      '引く作業ディレクトリが無いので lsof は起こさない',
    ).toEqual(['ps']);
  });

  it('ps が何も返さなくても、0 件と言う', async () => {
    const { run } = createRun({ ps: { out: '' } });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result, '起こせて空だったのは、落ちたのとは違う').toEqual(observed([]));
  });
});

describe('lsof の出力をパースする', () => {
  it('`pid` の行の後に続く作業ディレクトリを、その `pid` のものとする', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n  102 claude\n  103 claude\n' },
      lsof: {
        out: ['p101', 'n/home/me/a', 'p102', 'n/home/me/b', 'p103', 'n/home/me/c', ''].join('\n'),
      },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      result,
      '`pid` と作業ディレクトリの対応が崩れると、プロセスが別のプロジェクトに数えられる',
    ).toEqual(
      observed([
        { pid: 101, cwd: '/home/me/a' },
        { pid: 102, cwd: '/home/me/b' },
        { pid: 103, cwd: '/home/me/c' },
      ]),
    );
  });

  it('関わりの無いフィールドの行は読み飛ばす', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n' },
      lsof: { out: 'p101\nfcwd\nn/home/me/a\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result, 'lsof は頼んでいないフィールドも混ぜてくる').toEqual(
      observed([{ pid: 101, cwd: '/home/me/a' }]),
    );
  });

  it('`pid` の行より前に出た作業ディレクトリは捨てる', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n' },
      lsof: { out: 'n/home/me/orphan\np101\nn/home/me/a\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result, '持ち主の分からない作業ディレクトリを数えると、居ないプロセスが湧く').toEqual(
      observed([{ pid: 101, cwd: '/home/me/a' }]),
    );
  });

  it('出力が空なら、観測できなかったと言う', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n' },
      lsof: { out: '' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result.kind, 'claude が居ることは分かっている。0 件と言えばそれを打ち消す').toBe(
      'unobservable',
    );
    expect(errorOf(result)).toBeInstanceOf(ProcessInspectionError);
  });

  it('非ゼロで終わっても、受け取れた分は捨てない', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n  102 claude\n' },
      lsof: {
        throws: Object.assign(new Error('lsof: no pid 102'), {
          stdout: 'p101\nn/home/me/a\n',
        }),
      },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      result,
      'lsof は `pid` を 1 つ見失っただけでエラーとして終わる。数える間に 1 つ終わるのは普通のこと',
    ).toEqual(observed([{ pid: 101, cwd: '/home/me/a' }]));
  });

  it('途中で切られた最後の行は使わない', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n  102 claude\n' },
      lsof: {
        // バッファが溢れる(ENOBUFS)と、出力は行の途中で切れる
        throws: Object.assign(new Error('ENOBUFS'), {
          code: 'ENOBUFS',
          stdout: 'p101\nfcwd\nn/home/me/a\np102\nfcwd\nn/home/me/very-long-pa',
        }),
      },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      result,
      '切れた作業ディレクトリを渡すと、上のプロジェクトに当たって別のプロジェクトの待機として数えられる。渡さない方がまし',
    ).toEqual(observed([{ pid: 101, cwd: '/home/me/a' }]));
  });

  it('切れた行しか無ければ、観測できなかったと言う', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n' },
      lsof: {
        throws: Object.assign(new Error('ENOBUFS'), {
          stdout: 'p101\nfcwd\nn/home/me/a',
        }),
      },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result.kind, '使える行が 1 つも残らないのは、何も受け取れなかったのと同じ').toBe(
      'unobservable',
    );
  });

  it('出力が Buffer で載っていても読む', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n' },
      lsof: {
        throws: Object.assign(new Error('lsof: no pid 102'), {
          stdout: Buffer.from('p101\nfcwd\nn/home/me/a\n', 'utf8'),
        }),
      },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result, '`stdout` を文字列に直さない起こし方でも、受け取れた分は捨てない').toEqual(
      observed([{ pid: 101, cwd: '/home/me/a' }]),
    );
  });

  it('引いた作業ディレクトリは書き換えずにそのまま渡す', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n' },
      lsof: { out: 'p101\nn/private/var/folders/me/work\n' },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(
      result,
      'lsof の返す作業ディレクトリは元から解決済み。`realpath` を掛け直すと帰属の突き合わせが揺れる',
    ).toEqual(observed([{ pid: 101, cwd: '/private/var/folders/me/work' }]));
  });

  it('lsof が落ちれば、観測できなかったと言う', async () => {
    const { run } = createRun({
      ps: { out: '  101 claude\n  102 claude\n' },
      lsof: { throws: new Error('lsof: status error') },
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'darwin',
    }).list();

    expect(result.kind, '`pid` は分かっても、何件がどこで生きているかは言えない').toBe(
      'unobservable',
    );
    expect(errorOf(result)).toBeInstanceOf(ProcessInspectionError);
  });
});

describe('Linux では /proc/<pid>/cwd を読む', () => {
  function stubReadlink(links: Readonly<Record<string, string>>) {
    return vi.spyOn(fs, 'readlinkSync').mockImplementation(((target: fs.PathLike) => {
      const cwd = links[String(target)];
      if (cwd === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return cwd;
    }) as typeof fs.readlinkSync);
  }

  it('`pid` ごとに作業ディレクトリを引く', async () => {
    const { run, calls } = createRun({
      ps: { out: '  101 claude\n  102 claude\n' },
    });
    stubReadlink({
      '/proc/101/cwd': '/home/me/a',
      '/proc/102/cwd': '/home/me/b',
    });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'linux',
    }).list();

    expect(result).toEqual(
      observed([
        { pid: 101, cwd: '/home/me/a' },
        { pid: 102, cwd: '/home/me/b' },
      ]),
    );
    expect(
      calls.map((c) => c.file),
      'Linux は `/proc` から直に引ける',
    ).toEqual(['ps']);
  });

  it('1 つ引けなくても、残りは数える', async () => {
    const { run } = createRun({ ps: { out: '  101 claude\n  102 claude\n' } });
    stubReadlink({ '/proc/102/cwd': '/home/me/b' });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'linux',
    }).list();

    expect(result, '数えている間に終わった 1 つのために、見えている分まで捨てない').toEqual(
      observed([{ pid: 102, cwd: '/home/me/b' }]),
    );
  });

  it('1 つも引けなければ、観測できなかったと言う', async () => {
    const { run } = createRun({ ps: { out: '  101 claude\n  102 claude\n' } });
    const readlink = stubReadlink({});

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'linux',
    }).list();

    expect(
      readlink.mock.calls.map(([target]) => String(target)),
      '1 つ落ちたところで止めない。全部当たったうえで 1 つも引けなかった、が言いたいこと',
    ).toEqual(['/proc/101/cwd', '/proc/102/cwd']);
    expect(
      result.kind,
      '覗く権限が無いだけなのに、0 件と言えばプロジェクトが静まり返って見える',
    ).toBe('unobservable');
    expect(errorOf(result)).toBeInstanceOf(ProcessInspectionError);
  });

  it('claude が居なければ、/proc を覗かずに 0 件と言う', async () => {
    const { run } = createRun({ ps: { out: '  101 node\n' } });
    const readlink = vi.spyOn(fs, 'readlinkSync');

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'linux',
    }).list();

    expect(result).toEqual(observed([]));
    expect(readlink, '引く相手が居ない').not.toHaveBeenCalled();
  });

  it('ps が落ちれば、観測できなかったと言う', async () => {
    const { run } = createRun({ ps: { throws: new Error('spawn ps ENOENT') } });

    const result = await createOsAgentProcessIntegration({
      run,
      platform: 'linux',
    }).list();

    expect(result.kind, '機械が変わっても、数えられなかったことは 0 件ではない').toBe(
      'unobservable',
    );
    expect(errorOf(result)).toBeInstanceOf(ProcessInspectionError);
  });

  it('ps は起こす。`pid` はそこからしか分からない', async () => {
    const { run, calls } = createRun({ ps: { out: '  101 claude\n' } });
    stubReadlink({ '/proc/101/cwd': '/home/me/a' });

    await createOsAgentProcessIntegration({ run, platform: 'linux' }).list();

    expect(calls[0]).toEqual({ file: 'ps', args: PS_ARGS });
  });
});
