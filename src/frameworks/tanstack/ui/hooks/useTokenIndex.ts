import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { gitQuery } from '../../queries/git.query.ts';
import { githubIssuesQuery } from '../../queries/issues.query.ts';
import {
  agentTokens,
  commitTokens,
  gitTokens,
  type IssueRef,
  issueIndex,
  type TokenDict,
  tokenDict,
} from '../derive/tokens.ts';

/* 文中の語をチップにするためのインデックスを、一つの `lookup` にまとめて用意する。

   会話のパネルも題名も同じインデックスを要るので、ここに寄せてある。課題と Git は 1 度取れば
   どちらでも使い回せる — 問い合わせのキーが Work の画面と同じなので、二度は取りに行かない。

   **見ているプロジェクトのことは、見ている間ずっとインデックスに持っている。** 課題と Git を
   ここで引くのはそのためで、Work の画面を開いていなくても sha がチップになる。
   どちらも読めなくてもチップにならないだけで、文はそのまま出る。 */

export type TokenIndex = TokenDict;

export function useTokenIndex(project: ProjectJson | undefined): TokenIndex {
  // 閉じたものもインデックスに入れる。会話が参照するのは大半が統合済みの課題である
  const tracker = useQuery({
    ...githubIssuesQuery(project?.id ?? '', true),
    enabled: project !== undefined,
  });
  const repository = useQuery({
    ...gitQuery(project?.id ?? ''),
    enabled: project !== undefined,
  });

  const issues = useMemo(() => {
    const response = tracker.data;
    if (response === undefined || response === null || !response.ok)
      return new Map<string, IssueRef>();
    return issueIndex(response.body.issues);
  }, [tracker.data]);

  const overview = repository.data?.ok === true ? repository.data.body : undefined;
  const agents = useMemo(() => agentTokens(project), [project]);
  const gits = useMemo(() => gitTokens(project, overview), [project, overview]);
  const commits = useMemo(() => commitTokens(overview), [overview]);

  return useMemo(() => tokenDict(issues, agents, gits, commits), [issues, agents, gits, commits]);
}
