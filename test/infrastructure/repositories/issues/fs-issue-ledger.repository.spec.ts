import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsIssueLedgerRepository } from '~/infrastructure/repositories/issues/fs-issue-ledger.repository.ts';

/* 本物のファイルで確かめる。ここは「無い」と「読めなかった」を分ける場所なので、
   偽の fs に当てても、その分かれ目そのものは確かめられない。

   書いてよいのは `mkdtemp` の下だけである。 */

let root: string;

/** 権利を落とした検査の後片付け。落としたままだと消せない */
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

/* root で走る機械では権利を落としても読めてしまう。
   そこでは「読めない」を作れないので、その検査は飛ばす。 */
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

/** 巣ひとつを組む。台帳は巣の直下の決まった場所にしか無い */
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

/* 幅を持つ読み取りに替わっても、小さな台帳では気付けない。この道具が正本に掛けている
   いちばん広い窓(8MiB)より大きな台帳を組んで、幅そのものが無いことを確かめる。 */
const WIDEST_WINDOW_BYTES = 8 * 1024 * 1024;

function hugeLedger(): {
  readonly text: string;
  readonly first: string;
  readonly last: string;
} {
  const lines: string[] = [];
  /* 数えるのは字の数である。byte の数は字の数より少なくならないので、字で超えていれば
     byte でも超えている。**多バイトの字で嵩を稼いではいけない** — 窓は byte で切るとは
     限らず、字の数で切る実装は、byte だけ大きい台帳をすり抜ける。 */
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

describe('台帳の字を持ち帰る', () => {
  it('巣の直下の台帳を、書かれていた字のまま返す', async () => {
    writeLedger(root, LEDGER);

    const text = await repo().readLedgerText(root);
    expect(text, '読み解きは内側の仕事。ここで課題に組み替えると、意味が二か所に散る').toEqual({
      kind: 'observed',
      value: LEDGER,
    });
  });

  it('大きな台帳でも、窓を掛けずに全部を持ち帰る', async () => {
    const huge = hugeLedger();
    const file = writeLedger(root, huge.text);

    const text = await repo().readLedgerText(root);
    if (text.kind !== 'observed') throw new Error(`読めなかった: ${text.kind}`);
    expect(
      Buffer.byteLength(text.value, 'utf8'),
      '窓で切ると、切られた課題が「無い」ものとして消える。件数の札まで狂う',
    ).toBe(fs.statSync(file).size);
    const lines = text.value.split('\n');
    expect(lines[0], '先頭を切ると、古い課題が消える').toBe(huge.first);
    expect(lines.at(-2), '末尾を切ると、いま書かれた課題が消える').toBe(huge.last);
  });

  it('台帳が空でも、空の字として読めたことにする', async () => {
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
      'bd を使っていない巣はこうなる。観測としては成り立っているので、誤りではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('巣そのものが無ければ、無いこととして返す', async () => {
    const text = await repo().readLedgerText(path.join(root, 'どこにも無い'));
    expect(text).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('巣の場所として使えない字は、台帳を開く前に断る', async () => {
    for (const bad of ['', '.', 'relative/nest', '\0']) {
      const text = await repo().readLedgerText(bad);
      expect(
        text.kind,
        `${JSON.stringify(bad)}: 相対の名前で開くと、走らせた場所の台帳を別の巣のものとして返す`,
      ).toBe('unobservable');
      if (text.kind !== 'unobservable') return;
      expect(
        text.error.code,
        '台帳が在るかは確かめていない(無いとは言えない)。塞ぎ忘れた穴なので、もう一度求めれば通るかもしれない側(503)ではなく、こちらの穴(500)として言う',
      ).toBe('unexpected');
    }
  });

  it.skipIf(!DENIES_READ)('読む権利が無ければ、見に行けなかったこととして返す', async () => {
    const file = writeLedger(root, LEDGER);
    fs.chmodSync(file, 0o000);

    const text = await repo().readLedgerText(root);
    expect(text.kind, '読めないのを空と答えると、課題を 1 件も持たない巣として並んでしまう').toBe(
      'unobservable',
    );
    if (text.kind !== 'unobservable') return;
    expect(
      text.error.code,
      '名札で外の番号が決まる。台帳の読めなさは正本の読めなさと別に言えるようにする',
    ).toBe('ledger.unreadable');
  });
});
