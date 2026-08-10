import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSettings } from '~/infrastructure/config/paths.ts';
import {
  createFsViewerPreferencesRepository,
  preferencesFilePath,
} from '~/infrastructure/repositories/workspace/fs-viewer-preferences.repository.ts';

/* 本物のファイルで確かめる。ここは唯一の書き込みが起きる場所なので、
   偽の fs に当てても「書いた・断った」の分かれ目は確かめられない。

   **書いてよいのは `mkdtemp` の下だけである。** ホームディレクトリのパスを差し替える
   テストがあるので、後始末で必ず元へ戻す。 */

/* 一時ファイルの名前を当てられた場合を作るために、鍵になる乱数だけ差し替える。
   本物の名前は当てられないので、差し替えずに「シンボリックリンクを辿らない」は確かめられない。
   `fixed` を置いていない間は本物の乱数がそのまま出る。 */
const entropy = vi.hoisted(() => ({ fixed: undefined as string | undefined }));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: (size: number) =>
      entropy.fixed === undefined ? actual.randomBytes(size) : Buffer.from(entropy.fixed, 'hex'),
  };
});

/* 預けるテキスト。**この保存先は中身の意味を見ない**ので、テストもテキストのまま置いて
   テキストのまま読む。タブの選択として読めるかを見るのは application の側である。 */
const DOCUMENT = '{"version":1,"mode":"pinned","pinned":["-w-alpha"],"hidden":[]}\n';
const OTHER_DOCUMENT = '{"version":1,"mode":"all","pinned":[],"hidden":[]}\n';

let sandbox: string;

/* ガードは環境から観測元のパスを引くので、テストも環境を差し替える。
 **差し替えたものは必ず戻す。** 戻し損ねると、後のテストが本物のホームディレクトリを指す。 */
const ENV_KEYS = ['HOME', 'GLASSHIVE_PROJECTS_ROOT'] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(key: (typeof ENV_KEYS)[number], value: string): void {
  process.env[key] = value;
}

function restoreEnv(): void {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/* ホームディレクトリを一時領域へ移す。

   環境変数だけでは足りない。`os.homedir()` はネイティブ側で本物の環境を読むので、
   worker thread で走らせると `process.env.HOME` の差し替えが届かず、ガードが
   本物の `~/.claude` を基準にしてしまう。 */
function moveHome(to: string): void {
  setEnv('HOME', to);
  vi.spyOn(os, 'homedir').mockReturnValue(to);
}

/* 大小を区別しないファイルシステムか。区別するファイルシステムでは `.CLAUDE` は別の
   ディレクトリなので、そこで「同じディレクトリを指す」テストは作れない。 */
function probeCaseInsensitive(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-case-'));
  fs.mkdirSync(path.join(dir, 'aA'));
  const insensitive = fs.existsSync(path.join(dir, 'Aa'));
  fs.rmSync(dir, { recursive: true, force: true });
  return insensitive;
}

const CASE_INSENSITIVE = probeCaseInsensitive();

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

/* root で走る機械では権限を落としても書けてしまう。
   そこでは「書けない」を作れないので、そのテストは飛ばす。 */
function probeDenyWrite(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-probe-'));
  fs.chmodSync(dir, 0o500);
  let denied = false;
  try {
    fs.writeFileSync(path.join(dir, 'probe'), 'x');
  } catch {
    denied = true;
  }
  fs.chmodSync(dir, 0o700);
  fs.rmSync(dir, { recursive: true, force: true });
  return denied;
}

const DENIES_WRITE = probeDenyWrite();

const repo = (configDir: string) => createFsViewerPreferencesRepository({ configDir });

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-prefs-'));
});

afterEach(() => {
  entropy.fixed = undefined;
  vi.restoreAllMocks();
  restoreEnv();
  restorePermissions(sandbox);
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('`preferences.json` の保存先', () => {
  it('設定の保存先の直下に置く。階層を二重にしない', () => {
    const given = currentSettings({ GLASSHIVE_CONFIG_DIR: '/c/glasshive' });
    expect(
      preferencesFilePath(given.configDir),
      'configDir は既に末尾の glasshive を含む。ここで足すと glasshive/glasshive になる',
    ).toBe(path.join('/c/glasshive', 'preferences.json'));
  });

  it('何も渡されなくても、階層は二重にならない', () => {
    // パスを組み立てるだけで、ここでは何も読み書きしない
    const fallback = currentSettings({});
    const file = preferencesFilePath(fallback.configDir);
    expect(file).toBe(path.join(fallback.configDir, 'preferences.json'));
    expect(
      file.includes(path.join('glasshive', 'glasshive')),
      'XDG に倒れる場合でも glasshive は 1 つだけ',
    ).toBe(false);
    expect(path.basename(path.dirname(file))).toBe('glasshive');
  });

  it('XDG を渡した場合も、保存先の直下', () => {
    const xdg = currentSettings({ XDG_CONFIG_HOME: '/x/config' });
    expect(preferencesFilePath(xdg.configDir)).toBe('/x/config/glasshive/preferences.json');
  });
});

describe('置く', () => {
  it('書いて読み直すと、同じものが返る', async () => {
    const configDir = path.join(sandbox, 'config', 'glasshive');
    const store = repo(configDir);

    const saved = await store.save(DOCUMENT, { observedRoots: [] });
    expect(saved.ok, '置けたことを値で返す').toBe(true);
    expect(
      fs.readFileSync(preferencesFilePath(configDir), 'utf8'),
      '預かったテキストはそのまま置く。保存先が中身を書き換えると、置いた形と読める形が離れる',
    ).toBe(DOCUMENT);
    expect(await store.load()).toEqual({ kind: 'observed', value: DOCUMENT });
  });

  it('保存先が無ければ作る', async () => {
    const configDir = path.join(sandbox, 'まだ無い', 'glasshive');
    await repo(configDir).save(OTHER_DOCUMENT, { observedRoots: [] });
    expect(fs.existsSync(preferencesFilePath(configDir))).toBe(true);
  });

  it('置き換えた後に、書き掛けを残さない', async () => {
    const configDir = path.join(sandbox, 'config');
    const store = repo(configDir);
    await store.save(OTHER_DOCUMENT, { observedRoots: [] });
    await store.save(DOCUMENT, { observedRoots: [] });

    expect(
      fs.readdirSync(configDir),
      '一時ファイルを残すと、保存先に読めないファイルが置き換えのたびに溜まっていく',
    ).toEqual(['preferences.json']);
    expect(await store.load()).toEqual({ kind: 'observed', value: DOCUMENT });
  });

  it('`preferences.json` は持ち主だけが読める', async () => {
    const configDir = path.join(sandbox, 'config');
    await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(
      fs.statSync(preferencesFilePath(configDir)).mode & 0o077,
      '同じ機械の他の人に、どのプロジェクトを観ているかを読ませる理由が無い',
    ).toBe(0);
  });

  it.skipIf(!DENIES_WRITE)('置けなかったときは、置けた振りをしない', async () => {
    const configDir = path.join(sandbox, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.chmodSync(configDir, 0o500);

    const saved = await repo(configDir).save(DOCUMENT, { observedRoots: [] });
    expect(saved.ok).toBe(false);
    if (saved.ok) throw new Error('置けてしまった');
    expect(saved.error.code, '断ったのではないので、次に求めれば通るかもしれない側に倒す').toBe(
      'preferences.unwritable',
    );

    fs.chmodSync(configDir, 0o700);
  });
});

describe('書いてよいパスかを見る', () => {
  it('ホームディレクトリの観測元の配下は断る', async () => {
    moveHome(sandbox);
    const inside = path.join(sandbox, '.claude', 'glasshive');

    const saved = await repo(inside).save(DOCUMENT, { observedRoots: [] });
    expect(saved.ok, 'glasshive は観測元へ何一つ書かない').toBe(false);
    if (saved.ok) throw new Error('観測元へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(
      fs.existsSync(path.join(sandbox, '.claude')),
      '断ったのだから、ディレクトリすら作られていない',
    ).toBe(false);
  });

  it.each(['.beads', '.git'])('プロジェクトの中で読みに行く %s の配下は断る', async (material) => {
    const nest = path.join(sandbox, 'w', 'proj');
    const inside = path.join(nest, material, 'glasshive');

    const saved = await repo(inside).save(DOCUMENT, { observedRoots: [nest] });
    expect(saved.ok, '読みに行く先へ書き込むと、観測が自分の足跡を観ることになる').toBe(false);
    if (saved.ok) throw new Error('読む先へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.existsSync(inside)).toBe(false);
  });

  /* プロジェクトは人の作業ディレクトリである。`~` を作業ディレクトリにして走らせた履歴が
     あれば `~` 自体がプロジェクトになり、プロジェクトごと断つと既定の保存先にも置けず、
     ピン留めが一切できなくなる。 */
  it('プロジェクトの中でも、読まないところには置ける', async () => {
    const nest = path.join(sandbox, 'w', 'proj');
    const inside = path.join(nest, '.config', 'glasshive');

    const saved = await repo(inside).save(DOCUMENT, { observedRoots: [nest] });
    expect(
      saved.ok,
      'プロジェクトごと断つと、`~` を観測しているユーザーは `preferences.json` を一度も置けない',
    ).toBe(true);
    expect(await repo(inside).load()).toEqual({ kind: 'observed', value: DOCUMENT });
  });

  it('プロジェクトそのものが保存先でも、読む材料の外なら置ける', async () => {
    const nest = path.join(sandbox, 'w', 'proj');
    const saved = await repo(nest).save(DOCUMENT, { observedRoots: [nest] });
    expect(saved.ok).toBe(true);
    expect(fs.existsSync(path.join(nest, '.beads')), '読む材料は作られていない').toBe(false);
  });

  it('名前の頭が同じだけの隣は断らない', async () => {
    const nest = path.join(sandbox, 'a', 'b');
    const neighbour = path.join(sandbox, 'a', 'bc');

    const saved = await repo(neighbour).save(DOCUMENT, {
      observedRoots: [nest],
    });
    expect(
      saved.ok,
      '前方一致で見ると、隣のプロジェクトというだけで自分の `preferences.json` を置けなくなる',
    ).toBe(true);
    expect(await repo(neighbour).load()).toEqual({
      kind: 'observed',
      value: DOCUMENT,
    });
  });

  it('観測したプロジェクトが 1 つも無ければ、保存先だけで決まる', async () => {
    const saved = await repo(path.join(sandbox, 'config')).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok).toBe(true);
  });

  it('パスとして使えない保存先は断る', async () => {
    const saved = await repo('config/glasshive').save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok, '相対パスは、書いた側の作業ディレクトリでしか意味を持たない').toBe(false);
    if (saved.ok) throw new Error('相対パスへ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');

    const nul = await repo(`${sandbox}/cfg\0/glasshive`).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(nul.ok, '途中で切れる文字列は、ガードが見たパスと OS が開くパスが食い違う').toBe(false);
  });

  it('プロジェクトのパスに使えない文字列が混じっても、判定は止まらない', async () => {
    const saved = await repo(path.join(sandbox, 'config')).save(DOCUMENT, {
      observedRoots: ['', 'w/proj', `${sandbox}/w\0/proj`],
    });

    expect(
      saved.ok,
      'プロジェクトのパスは材料でしかない。使えない文字列は判定に足さないだけで、断りにはしない',
    ).toBe(true);
  });

  it('観測元へ向けたシンボリックリンクを保存先に渡しても断る', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });
    const link = path.join(sandbox, 'link-config');
    fs.symlinkSync(claude, link);

    const saved = await repo(link).save(DOCUMENT, { observedRoots: [] });
    expect(saved.ok, 'パスだけ見ると外に見えるが、書き込みは観測元の中へ落ちる').toBe(false);
    expect(fs.readdirSync(claude), '観測元へ何一つ置かれていない').toEqual([]);
  });

  it('読みに行く先へ向けたシンボリックリンクを保存先に渡しても断る', async () => {
    const nest = path.join(sandbox, 'w', 'proj');
    const ledger = path.join(nest, '.beads');
    fs.mkdirSync(ledger, { recursive: true });
    const link = path.join(sandbox, 'link-ledger');
    fs.symlinkSync(ledger, link);

    const saved = await repo(path.join(link, 'cfg')).save(DOCUMENT, {
      observedRoots: [nest],
    });
    expect(saved.ok, 'パスだけ見ると外に見えるが、書き込みは台帳の中へ落ちる').toBe(false);
    expect(fs.readdirSync(ledger), '台帳の中へ何一つ置かれていない').toEqual([]);
  });

  it.skipIf(!CASE_INSENSITIVE)('大小だけ違う保存先も、同じディレクトリなら断る', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });

    const saved = await repo(path.join(sandbox, '.CLAUDE')).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok, '大小を区別しないファイルシステムでは、このパスも同じディレクトリを開く').toBe(
      false,
    );
    expect(fs.readdirSync(claude)).toEqual([]);
  });

  /* 観測元がまだ無い機械では、本当のパスへ正規化できない。正規化できないパスを文字列のまま見比べると、
     大小を区別しないファイルシステムで `.CLAUDE` を作った後、それが `.claude` として開かれる。 */
  it('観測元がまだ無くても、大小だけ違う保存先は断る', async () => {
    moveHome(sandbox);

    const saved = await repo(path.join(sandbox, '.CLAUDE', 'glasshive')).save(DOCUMENT, {
      observedRoots: [],
    });

    expect(
      saved.ok,
      '確かめられない側では書かない。作ったディレクトリが後から観測元として開かれる',
    ).toBe(false);
    if (saved.ok) throw new Error('観測元になるディレクトリを作ってしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.readdirSync(sandbox), '断ったのだから、ディレクトリすら作られていない').toEqual([]);
  });

  it('`~/.claude/projects` を移してある機械でも、その配下は断る', async () => {
    moveHome(sandbox);
    const relocated = path.join(sandbox, 'data', 'agent-projects');
    fs.mkdirSync(relocated, { recursive: true });
    setEnv('GLASSHIVE_PROJECTS_ROOT', relocated);

    const saved = await repo(path.join(relocated, 'glasshive')).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok, '移した先を呼ぶ側の申告に頼ると、渡し忘れがそのまま不具合になる').toBe(false);
    if (saved.ok) throw new Error('移した観測元へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.readdirSync(relocated)).toEqual([]);
  });
});

describe('置き換えの途中', () => {
  it('一時ファイルの名前を当てられても、シンボリックリンクを辿らない', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });
    const victim = path.join(claude, 'settings.json');
    fs.writeFileSync(victim, '{"trusted":true}');

    const configDir = path.join(sandbox, '.config', 'glasshive');
    fs.mkdirSync(configDir, { recursive: true });
    /* 名前を当てられた場合そのものを作る。乱数を差し替えないと、シンボリックリンクは
       一度も触られないままテストが通り、辿るか辿らないかを何も確かめないことになる。 */
    entropy.fixed = '00'.repeat(8);
    const guessed = `${preferencesFilePath(configDir)}.${'00'.repeat(8)}.tmp`;
    fs.symlinkSync(victim, guessed);

    const saved = await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(saved.ok, '既に在るものへは書かない。名前を当てられたら、置くのをやめる').toBe(false);
    expect(
      fs.readFileSync(victim, 'utf8'),
      'シンボリックリンクを辿って書くと、ガードを通り抜けて観測元の中身を潰す',
    ).toBe('{"trusted":true}');
  });

  it('`preferences.json` そのものが観測元へ向けたシンボリックリンクなら、断る', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });
    const victim = path.join(claude, 'settings.json');
    fs.writeFileSync(victim, '{"trusted":true}');

    const configDir = path.join(sandbox, '.config', 'glasshive');
    fs.mkdirSync(configDir, { recursive: true });
    fs.symlinkSync(victim, preferencesFilePath(configDir));

    const saved = await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(saved.ok, '保存先のパスは外に見えても、辿った先は観測元の中である').toBe(false);
    if (saved.ok) throw new Error('観測元を指したまま置いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.readFileSync(victim, 'utf8')).toBe('{"trusted":true}');
  });

  it('`preferences.json` がシンボリックリンクでも、差し替えはリンクを外すだけ', async () => {
    moveHome(sandbox);
    const outside = path.join(sandbox, 'よそのファイル');
    fs.writeFileSync(outside, 'そのまま');

    const configDir = path.join(sandbox, '.config', 'glasshive');
    fs.mkdirSync(configDir, { recursive: true });
    const file = preferencesFilePath(configDir);
    fs.symlinkSync(outside, file);

    const saved = await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(saved.ok).toBe(true);
    expect(
      fs.readFileSync(outside, 'utf8'),
      '差し替えは rename ひとつ。開いて書くと、辿った先の中身が消える',
    ).toBe('そのまま');
    expect(
      fs.lstatSync(file).isSymbolicLink(),
      'シンボリックリンク自体が外れて、`preferences.json` の実体に入れ替わる',
    ).toBe(false);
  });
});

describe('読む', () => {
  it('`preferences.json` がまだ無ければ、無いこととして返す', async () => {
    expect(
      await repo(path.join(sandbox, 'config')).load(),
      'まだ一度も選んでいないのは、観測できなかったことではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('壊れたテキストでも、読めたテキストとして返す', async () => {
    const configDir = path.join(sandbox, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(preferencesFilePath(configDir), '{"version": 1,');

    expect(
      await repo(configDir).load(),
      '壊れているかをリポジトリが決めると、保存先を差し替えるたびに読める形が枝分かれする',
    ).toEqual({ kind: 'observed', value: '{"version": 1,' });
  });

  it('空のファイルも、読めたテキストとして返す', async () => {
    const configDir = path.join(sandbox, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(preferencesFilePath(configDir), '');

    expect(
      await repo(configDir).load(),
      '中身が無いことと、観測できなかったことは別の事実である',
    ).toEqual({ kind: 'observed', value: '' });
  });

  it('保存先そのものが無ければ、無いこととして返す', async () => {
    expect(
      await repo(path.join(sandbox, '無い', 'ディレクトリ')).load(),
      'ディレクトリごと無いのも、まだ一度も選んでいないことの一つである',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it.skipIf(!DENIES_WRITE)('読む権限が無ければ、観測できなかったこととして返す', async () => {
    const configDir = path.join(sandbox, 'config');
    const store = repo(configDir);
    await store.save(DOCUMENT, { observedRoots: [] });
    fs.chmodSync(preferencesFilePath(configDir), 0o000);

    const loaded = await store.load();
    expect(loaded.kind, '読めなかったのを「まだ選んでいない」と答えない').toBe('unobservable');
    if (loaded.kind !== 'unobservable') throw new Error('読めてしまった');
    expect(loaded.error.code).toBe('preferences.unreadable');

    fs.chmodSync(preferencesFilePath(configDir), 0o600);
  });
});
