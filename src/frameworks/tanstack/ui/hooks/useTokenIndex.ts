import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { issuesQuery } from '../../queries/issues.query.ts';
import {
  type AgentRef,
  agentTokens,
  gitTokens,
  type IssueRef,
  issueIndex,
} from '../derive/tokens.ts';

/* 文中の語を札にするための索きを、3 つまとめて用意する。

   会話の窓と題名の両方が同じ索きを要るので、ここに寄せてある。台帳は 1 度取れば
   両方で使い回せる — 問い合わせの鍵が同じなので、二度は取りに行かない。 */

export interface TokenIndex {
  readonly issues: Map<string, IssueRef>;
  readonly agents: Map<string, AgentRef>;
  readonly gits: Map<string, 'branch' | 'worktree'>;
  /** どれも空か。空なら文をそのまま出せばよく、語ごとの突き合わせを丸ごと省ける */
  readonly empty: boolean;
}

export function useTokenIndex(project: ProjectJson | undefined): TokenIndex {
  /* 閉じたものも索きに入れる。会話が参照するのは大半が統合済みの課題である。
     台帳が読めなくても札にならないだけで、文はそのまま出る。 */
  const ledger = useQuery({
    ...issuesQuery(project?.id ?? '', true),
    enabled: project !== undefined,
  });

  const issues = useMemo(() => {
    const response = ledger.data;
    if (response === undefined || response === null || !response.ok)
      return new Map<string, IssueRef>();
    return issueIndex(response.body.issues);
  }, [ledger.data]);

  const agents = useMemo(() => agentTokens(project), [project]);
  const gits = useMemo(() => gitTokens(project), [project]);

  return {
    issues,
    agents,
    gits,
    empty: issues.size === 0 && agents.size === 0 && gits.size === 0,
  };
}
