import { Link } from '@tanstack/react-router';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import type { TargetJson } from '~/interface/presenters/workspace/target.presenter.ts';
import { useT } from '../../i18n/useT.ts';

/* ディレクトリを名指して開いたウィンドウが、上に出すもの。**タブ行の代わりである。**

   ここに出るのは、いま開いているプロジェクトの名前とパスと、同じリポジトリに居るほかの
   プロジェクトである。1 つのリポジトリはたいてい複数のプロジェクトに割れている(根と、
   その下の作業ディレクトリと、worktree)ので、**開いたのが割れた片方であることを黙らない。**
   黙ると、隣で動いているセッションが「無かった」ものとして読まれる。

   タブ行と違って、ここに出る相手は人が選んだものではない。だから留めることも外すことも
   できない —— 押せば開くだけである。 */

export function OpenProject({
  open,
  current,
  projects,
  target,
}: {
  /** いま開いているプロジェクト。まだ索引が届いていなければ無い */
  readonly open: ProjectJson | undefined;
  /** いま開いているプロジェクトの id */
  readonly current: string | null;
  readonly projects: readonly ProjectJson[] | undefined;
  readonly target: TargetJson | null | undefined;
}) {
  const t = useT();

  /* 同じリポジトリに居る、いま開いていないもの。**名指されたプロジェクトもここに入る** ——
     隣を開けば、名指されたほうが「ほかの 1 つ」になる。 */
  const others = (
    target === null || target === undefined
      ? []
      : [
          ...(target.project_id === null ? [] : [target.project_id]),
          ...target.siblings.map((sibling) => sibling.id),
        ]
  )
    .filter((id) => id !== current)
    .map((id) => ({
      id,
      name:
        projects?.find((project) => project.id === id)?.name ??
        target?.siblings.find((sibling) => sibling.id === id)?.name ??
        id,
    }));

  return (
    <div id="here">
      <span className="here-name">{open?.name ?? target?.name ?? ''}</span>
      {/* パスは長い。全部は出ないので、切れた先は `title` で読めるようにする */}
      {open?.path !== null && open?.path !== undefined && (
        <span className="here-path" title={open.path}>
          {open.path}
        </span>
      )}
      {others.length > 0 && (
        <span className="here-rest">
          {t('also in this repository')}
          {others.map((other) => (
            <Link
              key={other.id}
              className="here-sib"
              to="/projects/$slug/work"
              params={{ slug: other.id }}
              search={{ only: true }}
            >
              {other.name}
            </Link>
          ))}
        </span>
      )}
    </div>
  );
}
