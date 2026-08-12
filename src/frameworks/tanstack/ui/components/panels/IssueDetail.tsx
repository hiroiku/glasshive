import { useQuery } from '@tanstack/react-query';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { githubIssuesQuery } from '../../../queries/issues.query.ts';
import { issueTrouble, transportTrouble } from '../../derive/trouble.ts';
import { useT } from '../../i18n/useT.ts';
import { NotObserved } from '../primitives/NotObserved.tsx';
import { ReadProgress } from '../primitives/ReadProgress.tsx';
import { GithubIssueDetail } from './GithubIssueDetail.tsx';

/* 課題 1 件のパネルの入口。**取ってくるのはここ、描くのは `GithubIssueDetail`。**

   一覧を取って id で 1 件を選ぶ形にしてあるのは、下流(この課題を待っている側)と
   繋がりの相手の題名が、その一覧からしか引けないからである。 */

export function IssueDetail({ id, project }: { id: string; project: ProjectJson | undefined }) {
  const t = useT();
  const slug = project?.id ?? '';
  /* **Work の画面と同じ `queryKey` を使う** —— 既に取ってあるので、ここで開いても
     `gh` はもう一度動かない。 */
  const tracker = useQuery({ ...githubIssuesQuery(slug, true), enabled: slug !== '' });

  const answer = tracker.data;
  /* 届いたぶんから引く。**読み終えるのを待たない** —— 開いた課題がページ 1 に在ったなら、
     ページ 5 が届く前に開ける。 */
  const tracked = answer?.state === 'observed' ? answer.issues : [];
  const issue = tracked.find((candidate) => candidate.id === id);
  if (issue !== undefined) {
    /* 下流(この課題を待っている側)は一覧の全部から引く。**まだ歩き終えていないことを渡す**
       —— 届いていない課題は下流に出ないので、黙ると「誰も待っていない」として読まれる。 */
    return (
      <GithubIssueDetail
        issue={issue}
        all={tracked}
        walked={answer?.walked === true}
        project={project}
        nowMs={Date.now()}
      />
    );
  }

  /* 断りも「無かった」も `.detail` の中に出す。外に出すと余白も中央寄せも無い素の文字が
     左上に残る。 */
  if (tracker.error !== null) {
    return (
      <div className="detail">
        <NotObserved {...transportTrouble(t, t('this issue'))} />
      </div>
    );
  }
  /* まだ読んでいる最中。**「この id は無かった」と言えるのは読み終えてからである** ——
     まだ届いていないページに在るかもしれない。歩き終えたかは値そのものが持っている ——
     取り直しの間も前の一覧を出したままにしてあるので、`isFetching` は答えにならない。 */
  if (answer === undefined || !answer.walked) {
    return <ReadProgress label={t('Reading the issue')} />;
  }
  /* 観測できなかったのと、一覧にこの id が無かったのは別である。**理由を持っているのは
     前者だけ** —— GitHub の remote が無いプロジェクトは失敗ではないので、理由を出さない。 */
  const code = answer.state === 'unobservable' ? answer.reason : null;
  return (
    <div className="detail">
      <NotObserved {...issueTrouble(t, id, code)} />
    </div>
  );
}
