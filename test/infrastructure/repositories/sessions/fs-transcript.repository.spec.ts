import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsTranscriptRepository } from '~/infrastructure/repositories/sessions/fs-transcript.repository.ts';

/* 本物のファイルで確かめる。ここは `~/.claude/projects` そのものを読む場所なので、
   偽の fs に当てても「読めた・読めなかった」の分かれ目は確かめられない。

   確かめるのは素材の採り方だけである。パースはここに無いので、
   採れたテキストが何を意味するかは application の側で確かめる。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');

let root: string;

/** 権限を落としたテストの後片付け。落としたままだと消せない */
function restorePermissions(target: string): void {
  try {
    fs.chmodSync(target, 0o700);
  } catch {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) restorePermissions(path.join(target, entry.name));
}

/* root で走る機械では権限を落としても読めてしまう。
   そこでは「読めない」を作れないので、そのテストは飛ばす。 */
function probeDenyRead(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-probe-'));
  const file = path.join(dir, 'probe');
  fs.writeFileSync(file, 'x');
  fs.chmodSync(file, 0o000);
  let denied = false;
  try {
    fs.readFileSync(file);
  } catch {
    denied = true;
  }
  fs.chmodSync(file, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
  return denied;
}

const DENIES_READ = probeDenyRead();

function writeLines(file: string, records: readonly unknown[]): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  return file;
}

function writeText(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** 読む相手。大きさと時刻はキャッシュのキーなので、実物から採る */
function at(file: string) {
  const stat = fs.statSync(file);
  return { file, mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
}

const repo = (transcriptsRoot: string = root) => createFsTranscriptRepository({ transcriptsRoot });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-transcripts-'));
});

afterEach(() => {
  restorePermissions(root);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('ディレクトリツリーを走査する', () => {
  it('名前ひとつぶんのディレクトリから、セッションとその子を並べる', async () => {
    writeLines(path.join(root, '-w-proj', 'sess-a.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(root, '-w-proj', 'sess-b.jsonl'), [{ type: 'user' }]);
    writeLines(
      path.join(root, '-w-proj', 'sess-a', 'subagents', 'agent-review-0123456789abcdef.jsonl'),
      [{ type: 'user' }],
    );

    const listed = await repo().listTranscripts();
    if (listed.kind !== 'observed') throw new Error(`走査できなかった: ${listed.kind}`);

    expect(listed.value).toHaveLength(1);
    const group = listed.value[0];
    expect(group?.slug).toBe('-w-proj');

    const sessions = [...(group?.sessions ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    expect(
      sessions.map((session) => session.id),
      '`transcript` のファイル名から拡張子を落としたものが、そのセッションを指すキー',
    ).toEqual(['sess-a', 'sess-b']);
    expect(
      sessions[0]?.subagents.map((subagent) => subagent.fileName),
      '`~/.claude/projects` に在った名前をそのまま渡す。ラベルを決めるのは言葉を持つ側の仕事',
    ).toEqual(['agent-review-0123456789abcdef.jsonl']);
    expect(sessions[1]?.subagents, '子のディレクトリが無いセッションは子を持たない').toEqual([]);
  });

  it('大きさと書かれた時刻を集めるだけで、中身は読まない', async () => {
    const file = writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    const stat = fs.statSync(file);

    const listed = await repo().listTranscripts();
    if (listed.kind !== 'observed') throw new Error('走査できなかった');
    const session = listed.value[0]?.sessions[0];
    expect(session?.sizeBytes).toBe(stat.size);
    expect(session?.mtimeMs).toBe(stat.mtimeMs);
    expect(session?.file).toBe(file);
  });

  it('`transcript` でないものと、ディレクトリでないものは数えない', async () => {
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    fs.writeFileSync(path.join(root, '-w-proj', 'notes.txt'), 'ただのメモ');
    fs.writeFileSync(path.join(root, 'loose.txt'), 'ディレクトリではない');

    const listed = await repo().listTranscripts();
    if (listed.kind !== 'observed') throw new Error('走査できなかった');
    expect(listed.value.map((group) => group.slug)).toEqual(['-w-proj']);
    expect(listed.value[0]?.sessions.map((session) => session.id)).toEqual(['sess']);
  });

  it('`~/.claude/projects` そのものが無ければ、無いこととして返す', async () => {
    const listed = await repo(path.join(root, 'まだ無い')).listTranscripts();
    expect(
      listed,
      '`~/.claude/projects` が無いのは観測の失敗ではない。まだ一度も動かしていない機械はこうなる',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it.skipIf(!DENIES_READ)(
    '`~/.claude/projects` を読む権限が無ければ、観測できなかったこととして返す',
    async () => {
      writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
      fs.chmodSync(root, 0o000);

      const listed = await repo().listTranscripts();
      expect(
        listed.kind,
        '読めないのを空と答えると、動いているセッションが 1 つも無いように見える',
      ).toBe('unobservable');
    },
  );

  it.skipIf(!DENIES_READ)('内側のディレクトリが読めなくても、他の名前は見えたまま', async () => {
    writeLines(path.join(root, '-w-open', 'sess.jsonl'), [{ type: 'user' }]);
    const closed = path.join(root, '-w-closed');
    writeLines(path.join(closed, 'sess.jsonl'), [{ type: 'user' }]);
    fs.chmodSync(closed, 0o000);

    const listed = await repo().listTranscripts();
    if (listed.kind !== 'observed') throw new Error('走査できなかった');
    const slugs = listed.value.map((group) => group.slug).sort();
    expect(slugs, '読めないディレクトリ 1 つで、`~/.claude/projects` 全体を隠さない').toEqual([
      '-w-closed',
      '-w-open',
    ]);
    const closedGroup = listed.value.find((group) => group.slug === '-w-closed');
    expect(closedGroup?.sessions).toEqual([]);
  });
});

describe('子を集める', () => {
  /** 名前ひとつぶんのディレクトリを走査して、そのセッションの子だけを取り出す */
  async function subagentsOf(sessionId: string) {
    const listed = await repo().listTranscripts();
    if (listed.kind !== 'observed') throw new Error(`走査できなかった: ${listed.kind}`);
    const session = listed.value[0]?.sessions.find((candidate) => candidate.id === sessionId);
    if (session === undefined) throw new Error(`セッションが見えない: ${sessionId}`);
    return [...session.subagents].sort((a, b) => a.id.localeCompare(b.id));
  }

  it('走りごとに切られた内側のディレクトリに居る子も集める', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'workflows', 'wf_x', 'agent-a2.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'workflows', 'wf_y', 'nested', 'agent-a3.jsonl'), [
      { type: 'user' },
    ]);

    const collected = await subagentsOf('sess');
    expect(
      collected.map((subagent) => subagent.id),
      '直下しか走査しないと、走りのディレクトリに入った子が丸ごと落ちる',
    ).toEqual(['agent-a1', 'agent-a2', 'agent-a3']);
    expect(
      collected[1]?.file,
      '`file` は走査したパスそのまま。途中のディレクトリをまとめて直下の振りをしない',
    ).toBe(path.join(subagents, 'workflows', 'wf_x', 'agent-a2.jsonl'));
  });

  /* 走りの名前はディレクトリの構造にしか無い。子の `transcript` にも `*.meta.json` にも
     書かれていないので、走査するときに拾わなければ、同じ走りの仲間だったことは二度と言えない。 */
  it('走りのディレクトリの名前を、その中の子に持たせる', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'workflows', 'wf_x', 'agent-a2.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'workflows', 'wf_y', 'nested', 'agent-a3.jsonl'), [
      { type: 'user' },
    ]);

    const collected = await subagentsOf('sess');
    expect(
      collected.map((subagent) => subagent.runId),
      '走りの外の子は持たない。走りのディレクトリの直下の名前だけが走りを指し、その先はどれだけ深くても同じ走りの中',
    ).toEqual([null, 'wf_x', 'wf_y']);
  });

  it('セッションの `transcript` はディレクトリの直下だけで、内側のディレクトリには降りない', async () => {
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(root, '-w-proj', 'sess', 'subagents', 'agent-a1.jsonl'), [
      { type: 'user' },
    ]);

    const listed = await repo().listTranscripts();
    if (listed.kind !== 'observed') throw new Error('走査できなかった');
    expect(
      listed.value[0]?.sessions.map((session) => session.id),
      'セッションは入れ子にならない。子をセッションとして並べると、同じ `transcript` が二度出る',
    ).toEqual(['sess']);
  });

  it('隣の `*.meta.json` から、`agentType` と親と深さを読む', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    writeText(
      path.join(subagents, 'agent-a1.meta.json'),
      JSON.stringify({
        agentType: 'workflow-subagent',
        description: 'かぞえなおす',
        parentAgentId: 'agent-a0',
        model: 'claude-opus-5',
      }),
    );

    const collected = await subagentsOf('sess');
    expect(collected[0]?.meta, '親子は `*.meta.json` にしか書かれていない').toEqual({
      agentType: 'workflow-subagent',
      name: null,
      toolUseId: null,
      description: 'かぞえなおす',
      parentAgentId: 'agent-a0',
    });
  });

  it('走りのディレクトリに居る子の `*.meta.json` も、その隣から読む', async () => {
    const run = path.join(root, '-w-proj', 'sess', 'subagents', 'workflows', 'wf_x');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(run, 'agent-a2.jsonl'), [{ type: 'user' }]);
    writeText(path.join(run, 'agent-a2.meta.json'), JSON.stringify({ spawnDepth: 1 }));

    const collected = await subagentsOf('sess');
    expect(collected[0]?.meta).toEqual({
      agentType: null,
      name: null,
      toolUseId: null,
      description: null,
      parentAgentId: null,
    });
  });

  it('`*.meta.json` が無くても、壊れていても、子は残る', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a2.jsonl'), [{ type: 'user' }]);
    writeText(path.join(subagents, 'agent-a2.meta.json'), '{ここで切れて');
    writeLines(path.join(subagents, 'agent-a3.jsonl'), [{ type: 'user' }]);
    writeText(path.join(subagents, 'agent-a3.meta.json'), '"`*.meta.json` の形をしていない"');

    const collected = await subagentsOf('sess');
    expect(
      collected.map((subagent) => subagent.id),
      '`*.meta.json` を読めないことで子が消えると、動いている子が居ないように見える',
    ).toEqual(['agent-a1', 'agent-a2', 'agent-a3']);
    expect(collected.map((subagent) => subagent.meta)).toEqual([null, null, null]);
  });

  it('書かれ方が違う値は、書かれていなかったものに倒す', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    writeText(
      path.join(subagents, 'agent-a1.meta.json'),
      JSON.stringify({
        agentType: 7,
        name: 42,
        toolUseId: false,
        description: { text: 'かぞえなおす' },
        parentAgentId: ['agent-a0'],
      }),
    );

    const collected = await subagentsOf('sess');
    expect(
      collected[0]?.meta,
      '観測した値をそのまま上へ流すと、パースする側が数でないものを数える',
    ).toEqual({
      agentType: null,
      name: null,
      toolUseId: null,
      description: null,
      parentAgentId: null,
    });
  });

  it('`*.meta.json` そのものは子として数えない', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    writeText(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ spawnDepth: 1 }));
    writeText(path.join(subagents, 'agent-a1.forked-skill.json'), '{}');

    const collected = await subagentsOf('sess');
    expect(
      collected.map((subagent) => subagent.fileName),
      '`transcript` の隣に置かれた `*.meta.json` は、`transcript` ではない',
    ).toEqual(['agent-a1.jsonl']);
  });

  it('走りそのもののログは子として数えない', async () => {
    const run = path.join(root, '-w-proj', 'sess', 'subagents', 'workflows', 'wf_x');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(run, 'agent-a2.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(run, 'journal.jsonl'), [{ type: 'started', agentId: 'agent-a2' }]);

    const collected = await subagentsOf('sess');
    expect(
      collected.map((subagent) => subagent.id),
      '走りのログを子として並べると、誰も動かしていない仕事が木に出る',
    ).toEqual(['agent-a2']);
  });

  it.skipIf(!DENIES_READ)('内側のディレクトリが読めなくても、他の子は見えたまま', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    const closed = path.join(subagents, 'workflows', 'wf_x');
    writeLines(path.join(closed, 'agent-a2.jsonl'), [{ type: 'user' }]);
    fs.chmodSync(closed, 0o000);

    const collected = await subagentsOf('sess');
    expect(
      collected.map((subagent) => subagent.id),
      '読めないディレクトリ 1 つで、他の子まで隠さない',
    ).toEqual(['agent-a1']);
  });

  it.skipIf(!DENIES_READ)('`*.meta.json` を読む権限が無くても、子は残る', async () => {
    const subagents = path.join(root, '-w-proj', 'sess', 'subagents');
    writeLines(path.join(root, '-w-proj', 'sess.jsonl'), [{ type: 'user' }]);
    writeLines(path.join(subagents, 'agent-a1.jsonl'), [{ type: 'user' }]);
    const meta = writeText(
      path.join(subagents, 'agent-a1.meta.json'),
      JSON.stringify({ spawnDepth: 1 }),
    );
    fs.chmodSync(meta, 0o000);

    const collected = await subagentsOf('sess');
    expect(collected.map((subagent) => subagent.id)).toEqual(['agent-a1']);
    expect(
      collected[0]?.meta,
      '読めなかった `*.meta.json` は、無かったのと同じ扱いにする',
    ).toBeNull();
  });
});

describe('大きさと時刻を採る', () => {
  it('走査してから読むまでの間に伸びた分も、採り直せば見える', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'abc\n');
    const before = await repo().statTranscript(file);
    fs.appendFileSync(file, 'defg\n');
    const after = await repo().statTranscript(file);

    expect(before).toEqual({
      kind: 'observed',
      value: expect.objectContaining({ sizeBytes: 4 }),
    });
    expect(after, '大きさは読む直前に採る。走査したときの数を信じない').toEqual({
      kind: 'observed',
      value: expect.objectContaining({ sizeBytes: 9 }),
    });
  });

  it('無い `transcript` は、無いこととして返す', async () => {
    expect(await repo().statTranscript(path.join(root, 'いない.jsonl'))).toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it.skipIf(!DENIES_READ)(
    'ディレクトリに入れなければ、観測できなかったこととして返す',
    async () => {
      const closed = path.join(root, '-w-closed');
      const buried = writeLines(path.join(closed, 'sess.jsonl'), [{ type: 'user' }]);
      fs.chmodSync(closed, 0o000);

      expect(
        (await repo().statTranscript(buried)).kind,
        '大きさを観測できなかったことを「無かった」に潰さない',
      ).toBe('unobservable');
    },
  );
});

describe('先頭から読む', () => {
  it('上限に届かなければ、そのまま返して届いたと言う', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\nbbb\n');

    const head = await repo().readHead(at(file), {
      maxBytes: 1024,
      trimPartialLine: true,
    });
    expect(head).toEqual({
      kind: 'observed',
      value: { text: 'aaa\nbbb\n', complete: true },
    });
  });

  it('上限ぴったりのときは、末尾の欠けた行を捨てる', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\nbbbbbb\n');

    const head = await repo().readHead(at(file), {
      maxBytes: 7,
      trimPartialLine: true,
    });
    expect(head, '切れた行を残すと、1 行としてパースしようとして必ず失敗する').toEqual({
      kind: 'observed',
      value: { text: 'aaa', complete: false },
    });
  });

  it('繕わないと言われたら、切れた行もそのまま返す', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\nbbbbbb\n');

    const head = await repo().readHead(at(file), {
      maxBytes: 7,
      trimPartialLine: false,
    });
    expect(head, '先頭の数行だけが要るときは、切れた行はどのみち落ちるだけ').toEqual({
      kind: 'observed',
      value: { text: 'aaa\nbbb', complete: false },
    });
  });

  it('改行が 1 つも無い `transcript` は、繕えないのでそのまま返す', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaaaaaaaaa');

    const head = await repo().readHead(at(file), {
      maxBytes: 4,
      trimPartialLine: true,
    });
    expect(head).toEqual({
      kind: 'observed',
      value: { text: 'aaaa', complete: false },
    });
  });

  it('無い `transcript` は、無いこととして返す', async () => {
    const head = await repo().readHead(
      { file: path.join(root, 'いない.jsonl'), mtimeMs: NOW, sizeBytes: 10 },
      { maxBytes: 1024, trimPartialLine: true },
    );
    expect(head).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it.skipIf(!DENIES_READ)(
    '読む権限の無い `transcript` は、観測できなかったこととして返す',
    async () => {
      const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\n');
      const location = at(file);
      fs.chmodSync(file, 0o000);

      const head = await repo().readHead(location, {
        maxBytes: 1024,
        trimPartialLine: true,
      });
      expect(
        head.kind,
        '読めないのを空のテキストと答えると、何も書かれていない `transcript` に見える',
      ).toBe('unobservable');
    },
  );
});

describe('末尾から読む', () => {
  it('先頭まで届けば、そのまま返して届いたと言う', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\nbbb\n');

    const tail = await repo().readTail(at(file), {
      maxBytes: 1024,
      trimPartialLine: true,
    });
    expect(tail).toEqual({
      kind: 'observed',
      value: { text: 'aaa\nbbb\n', complete: true },
    });
  });

  it('途中から始まったときは、最初の欠けた行を捨てる', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaaaaa\nbbb\n');

    const tail = await repo().readTail(at(file), {
      maxBytes: 7,
      trimPartialLine: true,
    });
    expect(tail, 'これより前にもテキストが在り得ることを、値として持ち帰る').toEqual({
      kind: 'observed',
      value: { text: 'bbb\n', complete: false },
    });
  });

  it('繕わないと言われたら、切れた行もそのまま返す', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaaaaa\nbbb\n');

    const tail = await repo().readTail(at(file), {
      maxBytes: 7,
      trimPartialLine: false,
    });
    expect(tail, '生のテキストから拾う使い方では、切れた行が混じっても困らない').toEqual({
      kind: 'observed',
      value: { text: 'aa\nbbb\n', complete: false },
    });
  });

  it('改行が 1 つも無い `transcript` は、繕うと何も残らない', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaaaaaaaaa');

    const tail = await repo().readTail(at(file), {
      maxBytes: 4,
      trimPartialLine: true,
    });
    expect(tail, '行として読めないものを 1 行として渡さない').toEqual({
      kind: 'observed',
      value: { text: '', complete: false },
    });
  });

  it('走査した後に伸びた `transcript` でも、いまの末尾を読む', async () => {
    const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\n');
    const stale = at(file);
    fs.appendFileSync(file, 'bbb\n');

    const tail = await repo().readTail(stale, {
      maxBytes: 4,
      trimPartialLine: false,
    });
    expect(tail, '読み取り範囲の先頭は、渡された大きさではなく読む直前の大きさで決まる').toEqual({
      kind: 'observed',
      value: { text: 'bbb\n', complete: false },
    });
  });

  it('無い `transcript` は、無いこととして返す', async () => {
    const tail = await repo().readTail(
      { file: path.join(root, 'いない.jsonl'), mtimeMs: NOW, sizeBytes: 10 },
      { maxBytes: 1024, trimPartialLine: false },
    );
    expect(tail).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it.skipIf(!DENIES_READ)(
    '読む権限の無い `transcript` は、観測できなかったこととして返す',
    async () => {
      const file = writeText(path.join(root, '-w-proj', 'sess.jsonl'), 'aaa\n');
      const location = at(file);
      fs.chmodSync(file, 0o000);

      const tail = await repo().readTail(location, {
        maxBytes: 1024,
        trimPartialLine: false,
      });
      expect(tail.kind).toBe('unobservable');
    },
  );
});

describe('パスを正規化する', () => {
  it('別名を辿って、実体のパスを返す', async () => {
    const real = path.join(root, 'ほんもの');
    fs.mkdirSync(real);
    const link = path.join(root, 'べつめい');
    fs.symlinkSync(real, link);

    const resolved = await repo().canonicalize(link);
    expect(resolved).toEqual({
      kind: 'observed',
      value: fs.realpathSync(real),
    });
  });

  it('無いパスは、無いこととして返す', async () => {
    const missing = path.join(root, 'どこにも無い');
    expect(
      await repo().canonicalize(missing),
      '渡されたパスをそのまま返すと、解決できた結果と見分けが付かず、覚える側が抱え込む',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it.skipIf(!DENIES_READ)('辿る権限が無ければ、観測できなかったこととして返す', async () => {
    const closed = path.join(root, 'とじた');
    fs.mkdirSync(path.join(closed, 'なか'), { recursive: true });
    fs.chmodSync(closed, 0o000);

    const resolved = await repo().canonicalize(path.join(closed, 'なか'));
    expect(resolved.kind, '辿れなかったのを「そういうパスだ」と答えない').toBe('unobservable');
  });
});
