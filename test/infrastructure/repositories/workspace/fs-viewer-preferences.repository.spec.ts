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

   **書いてよいのは mkdtemp の下だけである。** 家の場所を差し替える検査があるので、
   後始末で必ず元へ戻す。 */

/* 一時ファイルの名前を当てられた場合を作るために、鍵になる乱数だけ差し替える。
   本物の名前は当てられないので、差し替えずに「繋ぎを辿らない」は確かめられない。
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

/* 預ける字。**この棚は字の意味を見ない**ので、検査も字のまま置いて字のまま読む。
   選びとして読めるかを見るのは application の側である。 */
const DOCUMENT = '{"version":1,"mode":"pinned","pinned":["-w-alpha"],"hidden":[]}\n';
const OTHER_DOCUMENT = '{"version":1,"mode":"all","pinned":[],"hidden":[]}\n';

let sandbox: string;

/* 見張りは環境から観測元の場所を引くので、検査も環境を差し替える。
 **差し替えたものは必ず戻す。** 戻し損ねると、後の検査が本物の家を指す。 */
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

/** 家を仮の場所へ移す。`os.homedir()` は POSIX では HOME を見る */
function moveHome(to: string): void {
  setEnv('HOME', to);
}

/* 大小を区別しない仕組みか。区別する仕組みでは `.CLAUDE` は別の棚なので、
   そこで「同じ棚を指す」検査は作れない。 */
function probeCaseInsensitive(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-case-'));
  fs.mkdirSync(path.join(dir, 'aA'));
  const insensitive = fs.existsSync(path.join(dir, 'Aa'));
  fs.rmSync(dir, { recursive: true, force: true });
  return insensitive;
}

const CASE_INSENSITIVE = probeCaseInsensitive();

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

/* root で走る機械では権利を落としても書けてしまう。
   そこでは「書けない」を作れないので、その検査は飛ばす。 */
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
  restoreEnv();
  restorePermissions(sandbox);
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('覚え書きの置き場', () => {
  it('設定の置き場の直下に置く。階層を二重にしない', () => {
    const given = currentSettings({ GLASSHIVE_CONFIG_DIR: '/c/glasshive' });
    expect(
      preferencesFilePath(given.configDir),
      'configDir は既に末尾の glasshive を含む。ここで足すと glasshive/glasshive になる',
    ).toBe(path.join('/c/glasshive', 'preferences.json'));
  });

  it('渡されなかった枝でも、階層は二重にならない', () => {
    // 字を組み立てるだけで、ここでは何も読み書きしない
    const fallback = currentSettings({});
    const file = preferencesFilePath(fallback.configDir);
    expect(file).toBe(path.join(fallback.configDir, 'preferences.json'));
    expect(
      file.includes(path.join('glasshive', 'glasshive')),
      'XDG に倒れる枝でも glasshive は 1 つだけ',
    ).toBe(false);
    expect(path.basename(path.dirname(file))).toBe('glasshive');
  });

  it('XDG を渡した枝も、置き場の直下', () => {
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
      '預かった字はそのまま置く。棚が字を作り替えると、置いた形と読める形が離れる',
    ).toBe(DOCUMENT);
    expect(await store.load()).toEqual({ kind: 'observed', value: DOCUMENT });
  });

  it('置き場が無ければ作る', async () => {
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
      '一時ファイルを残すと、置き場に読めない字が置き換えのたびに溜まっていく',
    ).toEqual(['preferences.json']);
    expect(await store.load()).toEqual({ kind: 'observed', value: DOCUMENT });
  });

  it('覚え書きは持ち主だけが読める', async () => {
    const configDir = path.join(sandbox, 'config');
    await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(
      fs.statSync(preferencesFilePath(configDir)).mode & 0o077,
      '同じ機械の他の人に、どの巣を観ているかを読ませる理由が無い',
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

describe('書いてよい場所かを見る', () => {
  it('家の観測元の配下は断る', async () => {
    moveHome(sandbox);
    const inside = path.join(sandbox, '.claude', 'glasshive');

    const saved = await repo(inside).save(DOCUMENT, { observedRoots: [] });
    expect(saved.ok, 'この道具は観測元へ何一つ書かない').toBe(false);
    if (saved.ok) throw new Error('観測元へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(
      fs.existsSync(path.join(sandbox, '.claude')),
      '断ったのだから、棚すら作られていない',
    ).toBe(false);
  });

  it.each(['.beads', '.git'])('巣の中で読みに行く %s の配下は断る', async (material) => {
    const nest = path.join(sandbox, 'w', 'proj');
    const inside = path.join(nest, material, 'glasshive');

    const saved = await repo(inside).save(DOCUMENT, { observedRoots: [nest] });
    expect(saved.ok, '読みに行く先へ書き込むと、観測が自分の足跡を観ることになる').toBe(false);
    if (saved.ok) throw new Error('読む先へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.existsSync(inside)).toBe(false);
  });

  /* 巣は人の作業場所である。家(`~`)を作業場所にして走らせた履歴があれば家そのものが
     巣になり、巣ごと断つと既定の置き場にも置けず、留めることが一切できなくなる。 */
  it('巣の中でも、読まないところには置ける', async () => {
    const nest = path.join(sandbox, 'w', 'proj');
    const inside = path.join(nest, '.config', 'glasshive');

    const saved = await repo(inside).save(DOCUMENT, { observedRoots: [nest] });
    expect(saved.ok, '巣ごと断つと、家を観測している人は覚え書きを一度も置けない').toBe(true);
    expect(await repo(inside).load()).toEqual({ kind: 'observed', value: DOCUMENT });
  });

  it('巣そのものが置き場でも、読む材料の外なら置ける', async () => {
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
    expect(saved.ok, '前方一致で見ると、隣の巣というだけで自分の覚え書きを置けなくなる').toBe(true);
    expect(await repo(neighbour).load()).toEqual({
      kind: 'observed',
      value: DOCUMENT,
    });
  });

  it('観測した巣が 1 つも無ければ、置き場だけで決まる', async () => {
    const saved = await repo(path.join(sandbox, 'config')).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok).toBe(true);
  });

  it('場所として使えない置き場は断る', async () => {
    const saved = await repo('config/glasshive').save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok, '相対名は、書いた側の居場所でしか意味を持たない').toBe(false);
    if (saved.ok) throw new Error('相対名へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');

    const nul = await repo(`${sandbox}/cfg\0/glasshive`).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(nul.ok, '途中で切れる字は、見張りが見た場所と OS が開く場所が食い違う').toBe(false);
  });

  it('巣の場所に使えない字が混じっても、判定は止まらない', async () => {
    const saved = await repo(path.join(sandbox, 'config')).save(DOCUMENT, {
      observedRoots: ['', 'w/proj', `${sandbox}/w\0/proj`],
    });

    expect(
      saved.ok,
      '巣の場所は材料でしかない。使えない字は判定に足さないだけで、断りにはしない',
    ).toBe(true);
  });

  it('観測元へ向けた繋ぎを置き場に渡しても断る', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });
    const link = path.join(sandbox, 'link-config');
    fs.symlinkSync(claude, link);

    const saved = await repo(link).save(DOCUMENT, { observedRoots: [] });
    expect(saved.ok, '字だけ見ると外に見えるが、書き込みは観測元の中へ落ちる').toBe(false);
    expect(fs.readdirSync(claude), '観測元へ何一つ置かれていない').toEqual([]);
  });

  it('読みに行く先へ向けた繋ぎを置き場に渡しても断る', async () => {
    const nest = path.join(sandbox, 'w', 'proj');
    const ledger = path.join(nest, '.beads');
    fs.mkdirSync(ledger, { recursive: true });
    const link = path.join(sandbox, 'link-ledger');
    fs.symlinkSync(ledger, link);

    const saved = await repo(path.join(link, 'cfg')).save(DOCUMENT, {
      observedRoots: [nest],
    });
    expect(saved.ok, '字だけ見ると外に見えるが、書き込みは台帳の中へ落ちる').toBe(false);
    expect(fs.readdirSync(ledger), '台帳の中へ何一つ置かれていない').toEqual([]);
  });

  it.skipIf(!CASE_INSENSITIVE)('大小だけ違う置き場も、同じ棚なら断る', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });

    const saved = await repo(path.join(sandbox, '.CLAUDE')).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok, '大小を区別しない仕組みでは、この字も同じ棚を開く').toBe(false);
    expect(fs.readdirSync(claude)).toEqual([]);
  });

  /* 観測元がまだ無い機械では、本当の字へ均せない。均せない字を字のまま見比べると、
     大小を区別しない仕組みで `.CLAUDE` を作った後、それが `.claude` として開かれる。 */
  it('観測元がまだ無くても、大小だけ違う置き場は断る', async () => {
    moveHome(sandbox);

    const saved = await repo(path.join(sandbox, '.CLAUDE', 'glasshive')).save(DOCUMENT, {
      observedRoots: [],
    });

    expect(saved.ok, '確かめられない側では書かない。作った棚が後から観測元として開かれる').toBe(
      false,
    );
    if (saved.ok) throw new Error('観測元になる棚を作ってしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.readdirSync(sandbox), '断ったのだから、棚すら作られていない').toEqual([]);
  });

  it('正本の置き場を移してある機械でも、その配下は断る', async () => {
    moveHome(sandbox);
    const relocated = path.join(sandbox, 'data', 'agent-projects');
    fs.mkdirSync(relocated, { recursive: true });
    setEnv('GLASSHIVE_PROJECTS_ROOT', relocated);

    const saved = await repo(path.join(relocated, 'glasshive')).save(DOCUMENT, {
      observedRoots: [],
    });
    expect(saved.ok, '移した先を呼ぶ側の申告に頼ると、渡し忘れがそのまま穴になる').toBe(false);
    if (saved.ok) throw new Error('移した観測元へ書いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.readdirSync(relocated)).toEqual([]);
  });
});

describe('置き換えの途中', () => {
  it('一時ファイルの名前を当てられても、繋ぎを辿らない', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });
    const victim = path.join(claude, 'settings.json');
    fs.writeFileSync(victim, '{"trusted":true}');

    const configDir = path.join(sandbox, '.config', 'glasshive');
    fs.mkdirSync(configDir, { recursive: true });
    /* 名前を当てられた場合そのものを作る。乱数を差し替えないと、繋ぎは一度も
       触られないまま検査が通り、辿るか辿らないかを何も確かめないことになる。 */
    entropy.fixed = '00'.repeat(8);
    const guessed = `${preferencesFilePath(configDir)}.${'00'.repeat(8)}.tmp`;
    fs.symlinkSync(victim, guessed);

    const saved = await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(saved.ok, '既に在るものへは書かない。名前を当てられたら、置くのをやめる').toBe(false);
    expect(
      fs.readFileSync(victim, 'utf8'),
      '繋ぎを辿って書くと、見張りを通り抜けて観測元の中身を潰す',
    ).toBe('{"trusted":true}');
  });

  it('覚え書きそのものが観測元へ向けた繋ぎなら、断る', async () => {
    moveHome(sandbox);
    const claude = path.join(sandbox, '.claude');
    fs.mkdirSync(claude, { recursive: true });
    const victim = path.join(claude, 'settings.json');
    fs.writeFileSync(victim, '{"trusted":true}');

    const configDir = path.join(sandbox, '.config', 'glasshive');
    fs.mkdirSync(configDir, { recursive: true });
    fs.symlinkSync(victim, preferencesFilePath(configDir));

    const saved = await repo(configDir).save(DOCUMENT, { observedRoots: [] });

    expect(saved.ok, '置き場の字は外に見えても、辿った先は観測元の中である').toBe(false);
    if (saved.ok) throw new Error('観測元を指したまま置いてしまった');
    expect(saved.error.code).toBe('preferences.refused');
    expect(fs.readFileSync(victim, 'utf8')).toBe('{"trusted":true}');
  });

  it('覚え書きが繋ぎでも、差し替えは繋ぎを外すだけ', async () => {
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
      '繋ぎ自体が外れて、覚え書きの実体に入れ替わる',
    ).toBe(false);
  });
});

describe('読む', () => {
  it('覚え書きがまだ無ければ、無いこととして返す', async () => {
    expect(
      await repo(path.join(sandbox, 'config')).load(),
      'まだ一度も選んでいないのは、読めなかったことではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('壊れた字でも、読めた字として返す', async () => {
    const configDir = path.join(sandbox, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(preferencesFilePath(configDir), '{"version": 1,');

    expect(
      await repo(configDir).load(),
      '壊れているかを棚が決めると、置き場を差し替えるたびに読める形が枝分かれする',
    ).toEqual({ kind: 'observed', value: '{"version": 1,' });
  });

  it('空のファイルも、読めた字として返す', async () => {
    const configDir = path.join(sandbox, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(preferencesFilePath(configDir), '');

    expect(
      await repo(configDir).load(),
      '中身が無いことと、読みに行けなかったことは別の事実である',
    ).toEqual({ kind: 'observed', value: '' });
  });

  it('置き場そのものが無ければ、無いこととして返す', async () => {
    expect(
      await repo(path.join(sandbox, '無い', '棚')).load(),
      '棚ごと無いのも、まだ一度も選んでいないことの一つである',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it.skipIf(!DENIES_WRITE)('読む権利が無ければ、見に行けなかったこととして返す', async () => {
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
