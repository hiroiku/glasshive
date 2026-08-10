/* `git` の remote の URL から、ホストと owner とリポジトリ名を取り出す。純関数。

   remote の URL には形が何通りもある。`git@host:owner/repo.git`、`ssh://git@host/owner/repo`、
   `https://host/owner/repo.git`、`https://user:token@host/owner/repo`。どれも同じ場所を
   指しているので、同じ答えを返す。

   **資格情報は落とす。** `https://user:token@host/...` の形で書かれた remote は珍しくない。
   ここで拾ってしまうと、ホストの一部としてエラーメッセージや画面へ運ばれる。

   ホストを答えに含めるのは、GitHub かどうかを決めるのがここではないからである。GitHub
   Enterprise も GitLab も同じ形の URL を持つ。どのホストを相手にするかは、それを起こす側が
   決める。 */

/** remote 1 つ。`git config --get-regexp` の出力から起こす */
export interface RemoteEntry {
  /** `.git/config` に書かれている remote の名前。`origin` とは限らない */
  readonly name: string;
  readonly url: string;
  /* `gh repo set-default` が書く `gh-resolved` の値。`base` はこの remote 自身を指し、
     `OWNER/REPO` の形なら別のリポジトリを指す。
     **値の意味を決めるのはここではない** — 書かれていたものをそのまま渡す */
  readonly ghResolved: string | null;
}

/** remote 1 つが指している場所 */
export interface RemoteCoordinates {
  /** `github.com` や `github.example.com`。ポートと資格情報は落としてある */
  readonly host: string;
  readonly owner: string;
  /** 末尾の `.git` は落とした名前 */
  readonly name: string;
}

/* `scp` の書き方(`git@host:owner/repo.git`)。`ssh://` が付かないので URL としては読めない。

   **コロンの後ろが `/` なら、それはスキームの区切りである。** `https://host/owner/repo` の
   `https` をホストとして読んでしまうと、どの remote も同じ偽のホストを指すことになる。 */
const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(?![/\d])(.+)$/;

/** 末尾の `.git` と、前後のスラッシュを落とす */
const trimPath = (value: string): string => value.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');

/* パスを owner と名前に割る。

   **深い階層を持つホストがある。** GitLab のサブグループは `group/sub/repo` になる。
   owner として使えるのは名前の 1 つ手前だけなので、そこで割る。 */
function split(pathname: string): { owner: string; name: string } | null {
  const segments = trimPath(pathname)
    .split('/')
    .filter((segment) => segment !== '');
  if (segments.length < 2) return null;
  const name = segments[segments.length - 1];
  const owner = segments[segments.length - 2];
  if (name === undefined || owner === undefined || name === '' || owner === '') return null;
  return { owner, name };
}

/** ホスト名だけを残す。ポートも資格情報も落とす */
const hostOf = (authority: string): string =>
  authority
    .replace(/^[^@]*@/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();

/* remote の URL 1 つを読む。読めなければ `null`。

   読めないことは失敗ではない。remote が無いリポジトリも、`file://` を指している remote も、
   ただ「ホスト上の owner/repo ではない」というだけである。 */
export function parseRemoteUrl(url: string): RemoteCoordinates | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;

  const scp = SCP_LIKE.exec(trimmed);
  if (scp !== null) {
    const host = hostOf(scp[1] ?? '');
    const parts = split(scp[2] ?? '');
    if (host === '' || parts === null) return null;
    return { host, owner: parts.owner, name: parts.name };
  }

  /* ここから先はスキーム付きの URL。`URL` に解かせる — 自前で割ると、資格情報に `/` や `@` が
     入っている remote で境目を間違える。 */
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  // ホストを持たないスキーム(`file:` など)は、どのホストの owner/repo でもない
  if (parsed.hostname === '') return null;

  const parts = split(parsed.pathname);
  if (parts === null) return null;
  return { host: parsed.hostname.toLowerCase(), owner: parts.owner, name: parts.name };
}

/** `remote.<名前>.url` と `remote.<名前>.gh-resolved` の行。それ以外の設定は読まない */
const REMOTE_SETTING = /^remote\.(.+)\.(url|gh-resolved)$/;

/* `git config --get-regexp` の出力を remote ごとにまとめる。純関数。

   1 行は「キー 値」で、キーと値は空白 1 つで割れている。読めない行は落とす —— 設定ファイルには
   remote 以外の行も入るので、読めない行が在ることは失敗ではない。

   **並びは `.git/config` に書かれている順のままにする。** どれを本命と見るかを決めるのは
   呼ぶ側で、その決め方に「先に書かれているほう」が入ることがある。 */
export function parseRemoteConfig(stdout: string): readonly RemoteEntry[] {
  const entries: { name: string; url: string; ghResolved: string | null }[] = [];

  for (const line of stdout.split('\n')) {
    const space = line.indexOf(' ');
    if (space < 0) continue;
    const setting = REMOTE_SETTING.exec(line.slice(0, space));
    const name = setting?.[1];
    if (name === undefined) continue;

    let entry = entries.find((other) => other.name === name);
    if (entry === undefined) {
      entry = { name, url: '', ghResolved: null };
      entries.push(entry);
    }
    // 同じキーが 2 度書かれていたら後ろが勝つ。`git config` 自身も同じ読み方をする
    const value = line.slice(space + 1).trim();
    if (setting?.[2] === 'url') entry.url = value;
    else entry.ghResolved = value;
  }

  return entries;
}
