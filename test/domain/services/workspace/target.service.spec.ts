import { describe, expect, it } from 'vitest';
import { chooseTarget, type TargetCandidate } from '~/domain/services/workspace/target.service.ts';

/* 名指されたディレクトリが、どのプロジェクトを指すか。

   1 つのリポジトリは複数のプロジェクトに割れている(根・その下の作業ディレクトリ・worktree)。
   **打った人はそれを知らない。** だから選び方は決まっていなければならず、同じパスを打って
   別のプロジェクトが開く余地を残してはいけない。 */

const at = (id: string, canonicalPath: string, latestActivityMs = 0): TargetCandidate => ({
  id,
  canonicalPath,
  latestActivityMs,
});

const REPO = '/src/repo';

describe('名指されたディレクトリの解決', () => {
  it('根そのもののプロジェクトが在れば、それを開く', () => {
    const choice = chooseTarget({
      root: REPO,
      worktrees: [],
      candidates: [at('other', '/src/other', 900), at('repo', REPO, 100)],
    });

    expect(choice.id).toBe('repo');
    expect(choice.others).toEqual([]);
  });

  /* worktree のほうが動いていても、打ったのは根である。動きの多さで持っていかれると、
     同じコマンドが日によって別のプロジェクトを開く。 */
  it('worktree のほうが新しくても、根を打ったなら根を開く', () => {
    const choice = chooseTarget({
      root: REPO,
      worktrees: ['/src/repo-wt'],
      candidates: [at('wt', '/src/repo-wt', 900), at('repo', REPO, 100)],
    });

    expect(choice.id).toBe('repo');
    expect(choice.others, '同じリポジトリの残りは、ウィンドウの上に名前が出る相手である').toEqual([
      'wt',
    ]);
  });

  /* 根にセッションが無いことは在る(worktree でだけ動かしている)。そのときは、
     最後に書き込まれたほうを開く。 */
  it('根に何も無ければ、同じリポジトリで最後に動いていたものを開く', () => {
    const choice = chooseTarget({
      root: REPO,
      worktrees: ['/src/repo-a', '/src/repo-b'],
      candidates: [at('a', '/src/repo-a', 100), at('b', '/src/repo-b', 900)],
    });

    expect(choice.id).toBe('b');
    expect(choice.others).toEqual(['a']);
  });

  /* 打ったのがリポジトリの下の作業ディレクトリで、そこには何も無いことが在る。
     そこを含むプロジェクトが観測できているなら、それが見たいものである。 */
  it('名指した場所に何も無ければ、それを含む最も深いプロジェクトを開く', () => {
    const choice = chooseTarget({
      root: '/src/repo/apps/web',
      worktrees: [],
      candidates: [at('repo', REPO), at('apps', '/src/repo/apps')],
    });

    expect(choice.id, '含んでいるもののうち浅いほうを採ると、隣の仕事場が開く').toBe('apps');
  });

  /* 隣り合った名前を前方一致で見ると、別のリポジトリが同じリポジトリの一員になる。 */
  it('名前が前方一致するだけの隣は、同じリポジトリではない', () => {
    const choice = chooseTarget({
      root: REPO,
      worktrees: [],
      candidates: [at('sibling', '/src/repository', 900)],
    });

    expect(choice.id).toBe(null);
    expect(choice.others).toEqual([]);
  });

  /* まだ Claude Code を走らせていないディレクトリを名指すことは在る。**それは失敗ではない。** */
  it('何も観測できていなければ、開くプロジェクトは無い', () => {
    const choice = chooseTarget({ root: REPO, worktrees: [], candidates: [] });

    expect(choice.id).toBe(null);
  });

  /* 場所の分からないプロジェクトを混ぜると、名指したリポジトリの一員が増える。 */
  it('解決済みのパスを持たないプロジェクトは、どのリポジトリにも属さない', () => {
    const choice = chooseTarget({
      root: REPO,
      worktrees: [],
      candidates: [{ id: 'nowhere', canonicalPath: null, latestActivityMs: 900 }],
    });

    expect(choice.id).toBe(null);
    expect(choice.others).toEqual([]);
  });
});
