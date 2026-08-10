import type { JsonRecord } from '~/app-kernel/json.ts';
import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import type {
  GithubActor,
  GithubIssueExtra,
} from '~/domain/entities/issues/github-issue.entity.ts';
import type { IssueLedger } from '~/domain/entities/issues/issue.entity.ts';
import { parseRemoteConfig, parseRemoteUrl } from '~/domain/services/git/remote-parsing.service.ts';
import { buildLedger, parseIssuePage } from '~/domain/services/issues/github-issue.service.ts';

/* プロジェクト 1 つぶんの GitHub の課題を一覧にする。

   **bounded context をまたぐのはここだけである。** どのリポジトリを尋ねるかは `git` の
   remote が知っていて、課題は `issues` の言葉で返ってくる。domain は文脈をまたげないので、
   両方を持って突き合わせるのは呼び出しの仕事になる。

   remote から owner を引くのに `git` を起こすが、**その失敗をそのまま課題の失敗にしない。**
   remote を持たないリポジトリも、そもそも git のリポジトリでないディレクトリも、
   「GitHub の課題が無い」であって「課題を読めなかった」ではない。 */

/* GitHub の課題が持つ形は、外へ出すときにもそのまま要る。
   `interface` は domain を直に見られないので、ここが受け渡しの場所になる。 */
export type { GithubActor, GithubIssueExtra, IssueLedger };

/** GitHub のホスト。ここに載っていないホストの remote は、このトラッカーの相手ではない */
const GITHUB_HOSTS = new Set(['github.com']);

/* 1 ページで求める件数と、辿るページ数の上限。

   GitHub は 1 ページ 100 件までしか返さない。上限を置くのは、課題が数千件あるリポジトリで
   画面を開くたびに数十回の問い合わせが走るのを避けるためである。**当たったことは
   `truncated` で持ち回る** — 黙って切ると、上限より後ろの課題が「無かった」ことになる。 */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export interface ListGithubIssuesInput {
  readonly projectPath: string;
  /** 閉じた課題も一覧に載せるか。載せなくても件数には出る */
  readonly includeClosed: boolean;
}

export interface ListGithubIssuesUseCase {
  execute(input: ListGithubIssuesInput): Promise<Result<Observation<IssueLedger>, never>>;
}

/* 名前だけで本命を選ぶときの順。`gh` が同じ順で選ぶ。

   fork では課題が元のリポジトリに在るので、`upstream` が `origin` より先に来る。
   ここに載っていない名前の remote は、`.git/config` に書かれている順で後ろに続く。 */
const REMOTE_ORDER = ['upstream', 'github', 'origin'];

const rankOf = (name: string): number => {
  const at = REMOTE_ORDER.indexOf(name);
  return at < 0 ? REMOTE_ORDER.length : at;
};

/** remote の URL が GitHub を指していれば、その owner と名前 */
function githubOf(url: string): { owner: string; name: string } | null {
  const remote = parseRemoteUrl(url);
  if (remote === null || !GITHUB_HOSTS.has(remote.host)) return null;
  return { owner: remote.owner, name: remote.name };
}

/* このプロジェクトが指している GitHub のリポジトリ。

   remote を複数持つリポジトリで「どれが本命か」を決める手立ては git に無い。**推し量らず、
   `gh` に合わせる。** 課題を取りに行くのは `gh` なので、同じディレクトリで `gh issue list`
   が出すものと画面が食い違わない。`gh repo set-default` を打ってあれば、その答えを使う。
   打っていなければ名前の順で選ぶ。

   `origin` だけを見ることはしない。remote が 1 つしか無いリポジトリでも、その名前が
   `origin` でなければ「GitHub のリポジトリではない」と出てしまう。 */
async function locateRepository(
  git: GitCommandIntegration,
  projectPath: string,
): Promise<Observation<{ owner: string; name: string }>> {
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
     これは「どれが本命か」をユーザーが自分で決めた結果で、こちらが推し量る余地は無い。 */
  for (const remote of remotes) {
    if (remote.ghResolved === null) continue;
    if (remote.ghResolved === 'base') {
      const found = githubOf(remote.url);
      if (found !== null) return observed(found);
      continue;
    }
    const [owner, name] = remote.ghResolved.split('/');
    if (owner !== undefined && owner !== '' && name !== undefined && name !== '') {
      return observed({ owner, name });
    }
  }

  const ranked = [...remotes].sort((a, b) => rankOf(a.name) - rankOf(b.name));
  for (const remote of ranked) {
    const found = githubOf(remote.url);
    if (found !== null) return observed(found);
  }
  return absent('no-source');
}

export function createListGithubIssues(deps: {
  readonly git: GitCommandIntegration;
  readonly tracker: IssueTrackerIntegration;
  /* 顔を覚えておくところ。**引ける顔をここで入れ替える** ——
     観測した一覧に出てこない login を引けるままにしておくと、この画面は
     「任意の宛先へ代わりに取りに行く踏み台」に近づく。 */
  readonly avatars: AvatarCacheService;
}): ListGithubIssuesUseCase {
  return {
    async execute({ projectPath, includeClosed }) {
      const repository = await locateRepository(deps.git, projectPath);
      if (repository.kind !== 'observed') return ok(repository);

      const nodes: JsonRecord[] = [];
      let cursor: string | null = null;
      let truncated = false;

      for (let page = 0; page < MAX_PAGES; page++) {
        const answer = await deps.tracker.fetchIssuePage({
          owner: repository.value.owner,
          name: repository.value.name,
          cursor,
          pageSize: PAGE_SIZE,
        });
        /* 1 ページ目で躓いたなら、観測そのものが成り立っていない。2 ページ目より後なら、
           そこまでは観えている — **観えたぶんを捨てない。** 捨てると、認証が切れた瞬間に
           一覧が空になり、課題が 1 件も無いように見える。 */
        if (answer.kind !== 'observed') {
          if (page === 0) return ok(answer);
          truncated = true;
          break;
        }

        const parsed = parseIssuePage(answer.value);
        nodes.push(...parsed.nodes);
        if (!parsed.hasNextPage || parsed.endCursor === null) break;
        cursor = parsed.endCursor;
        // 次の周回に入れないなら、その先は読んでいない
        if (page === MAX_PAGES - 1) truncated = true;
      }

      const ledger = buildLedger(nodes, { includeClosed, truncated });
      deps.avatars.remember(ledger);
      /* 顔は待たずに先へ読んでおく。ブラウザーが求める頃にはメモリに在る。
       **取れなくても一覧は出る** — 顔は誰なのかを言うだけで、状態を言わない。 */
      deps.avatars.warm(ledger);
      return ok(observed(ledger));
    },
  };
}
