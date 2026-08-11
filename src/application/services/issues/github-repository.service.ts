import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import { parseRemoteConfig, parseRemoteUrl } from '~/domain/services/git/remote-parsing.service.ts';

/* プロジェクトが指している GitHub のリポジトリを決める。

   **bounded context をまたぐのはここである。** どのリポジトリを尋ねるかは `git` の remote が
   知っていて、課題は `issues` の言葉で返ってくる。domain は文脈をまたげないので、両方を
   持って突き合わせるのは application の仕事になる。

   一覧と、課題 1 件の本文と、尋ね先を要する呼び出しが 2 つある。**同じ答えを返さないと
   いけない** —— 一覧に出ていた課題を開いたら別のリポジトリを尋ねた、では話が合わない。
   だから決め方は 1 か所にしか置かない。 */

/** GitHub のホスト。ここに載っていないホストの remote は、このトラッカーの相手ではない */
const GITHUB_HOSTS = new Set(['github.com']);

/* 名前だけで本命を選ぶときの順。`gh` が同じ順で選ぶ。

   fork では課題が元のリポジトリに在るので、`upstream` が `origin` より先に来る。
   ここに載っていない名前の remote は、`.git/config` に書かれている順で後ろに続く。 */
const REMOTE_ORDER = ['upstream', 'github', 'origin'];

const rankOf = (name: string): number => {
  const at = REMOTE_ORDER.indexOf(name);
  return at < 0 ? REMOTE_ORDER.length : at;
};

export interface GithubRepository {
  readonly owner: string;
  readonly name: string;
}

/* 課題を尋ねる先と、そこをどう決めたか。

   **選んだことを黙らない。** GitHub を指す remote が 2 つ以上あるとき、どれが本命かを
   決める手立ては git に無いので、glasshive が名前の順で 1 つ選んでいる。黙ると、選ばれ
   なかったリポジトリの課題が「無い」ものとして画面に出る。`gh repo set-default` が
   書いてあれば選んでいないので、`others` は `0` になる。 */
export interface GithubSource {
  readonly repository: GithubRepository;
  /** 尋ねなかった GitHub のリポジトリの数 */
  readonly others: number;
}

/** remote の URL が GitHub を指していれば、その owner と名前 */
function githubOf(url: string): GithubRepository | null {
  const remote = parseRemoteUrl(url);
  if (remote === null || !GITHUB_HOSTS.has(remote.host)) return null;
  return { owner: remote.owner, name: remote.name };
}

/* 同じ場所を指す remote を 2 つと数えないための鍵。

   `origin` と `github` が同じリポジトリを指している設定は珍しくない。それを 2 つと数えると、
   選ぶ余地の無いところで「どちらを見ているのか」という迷いだけを作ることになる。
   GitHub は owner と名前の大小を区別しないので、揃えてから比べる。 */
const keyOf = (repository: GithubRepository): string =>
  `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`;

/* このプロジェクトが指している GitHub のリポジトリ。

   remote を複数持つリポジトリで「どれが本命か」を決める手立ては git に無い。**推し量らず、
   `gh` に合わせる。** 課題を取りに行くのは `gh` なので、同じディレクトリで `gh issue list`
   が出すものと画面が食い違わない。`gh repo set-default` を打ってあれば、その答えを使う。
   打っていなければ名前の順で選ぶ。

   `origin` だけを見ることはしない。remote が 1 つしか無いリポジトリでも、その名前が
   `origin` でなければ「GitHub のリポジトリではない」と出てしまう。

   選んだときは、選ばなかった数を添えて返す。**選び方を変えないまま、選んだことだけを
   言えるようにする** —— 尋ね先が画面と食い違わないことのほうが、複数を並べることより先に来る。 */
export async function locateGithubRepository(
  git: GitCommandIntegration,
  projectPath: string,
): Promise<Observation<GithubSource>> {
  const output = await git.run({
    cwd: projectPath,
    args: ['config', '--get-regexp', '^remote\\..+\\.(url|gh-resolved)$'],
    revisions: [],
  });
  /* 起こせなかったのも、非ゼロで終わったのも、ここでは「GitHub のリポジトリではない」に
     倒す。remote を持たないリポジトリで `git config --get-regexp` は 1 で終わるので、これを
     観測できなかったことにすると、ほとんどのプロジェクトが赤い画面になる。 */
  if (output.kind !== 'observed') return absent('no-source');

  const remotes = parseRemoteConfig(output.value);

  /* `gh-resolved` が書かれていれば、それが答えである。**名前の順より先に見る** ——
     これは「どれが本命か」をユーザーが自分で決めた結果で、こちらが推し量る余地は無い。
     選んでいないので、他に何本あっても `others` は `0` である。 */
  for (const remote of remotes) {
    if (remote.ghResolved === null) continue;
    if (remote.ghResolved === 'base') {
      const found = githubOf(remote.url);
      if (found !== null) return observed({ repository: found, others: 0 });
      continue;
    }
    const [owner, name] = remote.ghResolved.split('/');
    if (owner !== undefined && owner !== '' && name !== undefined && name !== '') {
      return observed({ repository: { owner, name }, others: 0 });
    }
  }

  const ranked = [...remotes].sort((a, b) => rankOf(a.name) - rankOf(b.name));
  const candidates = ranked
    .map((remote) => githubOf(remote.url))
    .filter((found): found is GithubRepository => found !== null);
  const chosen = candidates[0];
  if (chosen === undefined) return absent('no-source');
  return observed({ repository: chosen, others: new Set(candidates.map(keyOf)).size - 1 });
}
