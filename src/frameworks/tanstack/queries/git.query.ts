import { queryOptions } from '@tanstack/react-query';
import { getGit, getGitRef } from '../functions/git.ts';

/* 記録の問い合わせ。

   外の道具を線の数だけ起こすので、正本ほど気安くは取り直せない。合図では配らず、
   少し置いてから取り直す。 */

export const gitQueryKey = (projectId: string) => ['git', projectId] as const;

export const gitQuery = (projectId: string) =>
  queryOptions({
    queryKey: gitQueryKey(projectId),
    queryFn: () => getGit({ data: { projectId } }),
    staleTime: 15_000,
  });

export const gitRefQuery = (projectId: string, rev: string) =>
  queryOptions({
    queryKey: ['gitref', projectId, rev] as const,
    queryFn: () => getGitRef({ data: { projectId, rev } }),
    staleTime: 60_000,
  });
