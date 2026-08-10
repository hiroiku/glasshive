import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsIssueLedgerRepository } from '~/infrastructure/repositories/issues/fs-issue-ledger.repository.ts';

/* 本物のファイルで確かめる。ここは「無い」と「読めなかった」を分ける場所なので、
   偽の fs に当てても、その分かれ目そのものは確かめられない。

   書いてよいのは `mkdtemp` の下だけである。 */

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

/** プロジェクト 1 つを組む。台帳はプロジェクトの直下の決まったパスにしか無い */
function writeLedger(projectPath: string, text: string): string {
  const file = path.join(projectPath, '.beads', 'issues.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const repo = createFsIssueLedgerRepository;

const LEDGER = `${[
  {
    _type: 'issue',
    id: 'x-1',
    title: '生きている',
    status: 'open',
    description: '巨大な本文',
  },
  { _type: 'issue', id: 'x-2', title: '済み', status: 'closed' },
]
  .map((record) => JSON.stringify(record))
  .join('\n')}\n`;

/* 幅を持つ読み取りに替わっても、小さな台帳では気付けない。glasshive が `transcript` に
   掛けているいちばん広い読み取り範囲(8MiB)より大きな台帳を組んで、幅そのものが
   無いことを確かめる。 */
const WIDEST_WINDOW_BYTES = 8 * 1024 * 1024;

function hugeLedger(): {
  readonly text: string;
  readonly first: string;
  readonly last: string;
} {
  const lines: string[] = [];
  /* 数えるのは文字数である。byte 数は文字数より少なくならないので、文字数で超えていれば
     byte でも超えている。**多バイト文字で嵩を稼いではいけない** — 読み取り範囲は byte で
     切るとは限らず、文字数で切る実装は、byte だけ大きい台帳をすり抜ける。 */
  let length = 0;
  for (let index = 0; length <= WIDEST_WINDOW_BYTES; index += 1) {
    const line = JSON.stringify({
      _type: 'issue',
      id: `x-${index}`,
      title: `課題 ${'x'.repeat(96)}`,
      status: 'open',
    });
    lines.push(line);
    length += line.length + 1;
  }
  return {
    text: `${lines.join('\n')}\n`,
    first: lines[0] ?? '',
    last: lines.at(-1) ?? '',
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-issues-'));
});

afterEach(() => {
  restorePermissions(root);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('台帳のテキストを持ち帰る', () => {
  it('プロジェクトの直下の台帳を、書かれていたテキストのまま返す', async () => {
    writeLedger(root, LEDGER);

    const text = await repo().readLedgerText(root);
    expect(text, 'パースは内側の仕事。ここで課題に組み替えると、意味が二か所に散る').toEqual({
      kind: 'observed',
      value: LEDGER,
    });
  });

  it('大きな台帳でも、読み取り範囲を掛けずに全部を持ち帰る', async () => {
    const huge = hugeLedger();
    const file = writeLedger(root, huge.text);

    const text = await repo().readLedgerText(root);
    if (text.kind !== 'observed') throw new Error(`読めなかった: ${text.kind}`);
    expect(
      Buffer.byteLength(text.value, 'utf8'),
      '読み取り範囲で切ると、切られた課題が「無い」ものとして消える。件数まで狂う',
    ).toBe(fs.statSync(file).size);
    const lines = text.value.split('\n');
    expect(lines[0], '先頭を切ると、古い課題が消える').toBe(huge.first);
    expect(lines.at(-2), '末尾を切ると、いま書かれた課題が消える').toBe(huge.last);
  });

  it('台帳が空でも、空のテキストとして読めたことにする', async () => {
    writeLedger(root, '');

    const text = await repo().readLedgerText(root);
    expect(text, '中身が無いことと、台帳そのものが無いことは別の事実である').toEqual({
      kind: 'observed',
      value: '',
    });
  });

  it('台帳が無ければ、無いこととして返す', async () => {
    const text = await repo().readLedgerText(root);
    expect(
      text,
      'bd を使っていないプロジェクトはこうなる。観測としては成り立っているので、エラーではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('プロジェクトそのものが無ければ、無いこととして返す', async () => {
    const text = await repo().readLedgerText(path.join(root, 'どこにも無い'));
    expect(text).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('プロジェクトのパスとして使えない文字列は、台帳を開く前に断る', async () => {
    for (const bad of ['', '.', 'relative/nest', '\0']) {
      const text = await repo().readLedgerText(bad);
      expect(
        text.kind,
        `${JSON.stringify(bad)}: 相対パスで開くと、走らせた作業ディレクトリの台帳を別のプロジェクトのものとして返す`,
      ).toBe('unobservable');
      if (text.kind !== 'unobservable') return;
      expect(
        text.error.code,
        '台帳が在るかは確かめていない(無いとは言えない)。塞ぎ忘れた不具合なので、もう一度求めれば通るかもしれない側(503)ではなく、こちらの不具合(500)として言う',
      ).toBe('unexpected');
    }
  });

  it.skipIf(!DENIES_READ)('読む権限が無ければ、観測できなかったこととして返す', async () => {
    const file = writeLedger(root, LEDGER);
    fs.chmodSync(file, 0o000);

    const text = await repo().readLedgerText(root);
    expect(
      text.kind,
      '読めないのを空と答えると、課題を 1 件も持たないプロジェクトとして並んでしまう',
    ).toBe('unobservable');
    if (text.kind !== 'unobservable') return;
    expect(
      text.error.code,
      'エラーコードで外の HTTP ステータスが決まる。台帳の読めなさは `transcript` の読めなさと別に言えるようにする',
    ).toBe('ledger.unreadable');
  });
});
