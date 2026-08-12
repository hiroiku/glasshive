import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { TabAction } from '~/interface/controllers/workspace/preferences.controller.ts';
import type { PreferencesJson } from '~/interface/presenters/workspace/preferences.presenter.ts';
import { setPreferences } from '../../functions/preferences.ts';
import { preferencesQuery, preferencesQueryKey } from '../../queries/preferences.query.ts';
import { applyTabAction } from '../derive/tab-selection.ts';

/* 観ると決めたものの読み書きを、画面から使える形にまとめる。

   **送るのは「何をしたいか」だけである。** 記録の全体を送ると、読んでから送るまでの間に
   別のクライアントが足したぶんが黙って消える。読む・当てる・置くは向こう側で 1 つの操作に
   閉じてある。

   押した手応えを待たせないため、置きに行く前にクライアント側の状態を差し替える。観ると
   決めるのは自分の画面の並べ替えでしかなく、観測を待つ理由が無い。置けなかったときは元へ戻す。 */

export interface TabSelectionHandle {
  /** タブに出す id。記録した順に、観測に在るものだけが並ぶ */
  readonly visibleTabs: readonly string[];
  /** 観ると決めてあり、いま観測できている id */
  readonly watched: ReadonlySet<string>;
  /* 見つけたが、まだ観ると決めていないディレクトリ。**選び直すための一覧である** ——
     ここに出さないと、Claude Code を走らせたことのあるディレクトリを画面から選べない。 */
  readonly candidates: PreferencesJson['candidates'];
  /** `preferences.json` を読めたか。既定へ倒れた理由をユーザーへ伝えるために持つ */
  readonly storedState: PreferencesJson['stored']['state'];
  readonly toggleWatch: (id: string) => void;
  readonly moveWatch: (id: string, toIndex: number) => void;
  /** 置きに行って断られたときのエラーメッセージ。通っているときは `null` */
  readonly error: string | null;
}

export function useTabSelection(): TabSelectionHandle {
  const client = useQueryClient();
  const query = useQuery(preferencesQuery);
  const json = query.data;

  const mutation = useMutation({
    mutationFn: async (action: TabAction) => {
      const response = await setPreferences({ data: action });
      /* 断られたことを、待っている側のエラー経路へ載せる。載せずに通ったことにすると、
         差し替えた見た目がそのまま残り、次に開いたときに記録が黙って消える。 */
      if (!response.ok) throw new Error(response.body.message);
      return response.body;
    },

    /* 置きに行く前にクライアント側の状態を差し替える。戻すための前のコピーを添えて返す。 */
    onMutate: async (action) => {
      await client.cancelQueries({ queryKey: preferencesQueryKey });
      const previous = client.getQueryData<PreferencesJson>(preferencesQueryKey);
      if (previous !== undefined) {
        client.setQueryData<PreferencesJson>(preferencesQueryKey, {
          ...previous,
          /* **記録そのものは動かさない。** 記録は絶対パスで持たれていて、id からの
             読み替えを知っているのは向こう側だけである。結果が返ったときに揃う。 */
          visible_tabs: [...applyTabAction(previous.visible_tabs, action)],
        });
      }
      return { previous };
    },

    onError: (_error, _action, context) => {
      // 置けなかったのにタブだけ残ると、次に開いたとき黙って消える
      if (context?.previous !== undefined) {
        client.setQueryData(preferencesQueryKey, context.previous);
      }
    },

    onSuccess: (saved) => client.setQueryData(preferencesQueryKey, saved),
  });

  const visibleTabs = json?.visible_tabs ?? [];
  const watchedSet = useMemo(() => new Set(visibleTabs), [visibleTabs]);

  /* `preferences.json` をどう読めたか。**取りに行って落ちたのは、記録が無いこととは違う。**
     ここを一律に `absent` へ倒すと、一度も結果を受け取れていない画面が
     「まだ何も観ていない」と表示し、ユーザーには記録が黙って消えたようにしか見えない。
     まだ届いていないだけの間は倒してよい — 画面はその間なにも言わず、届けば入れ替わる。 */
  const storedState: PreferencesJson['stored']['state'] =
    json?.stored.state ?? (query.error === null ? 'absent' : 'unobservable');

  const toggleWatch = useCallback(
    (id: string) => {
      // どちらの操作かはクライアント側の見た目で決める。当てる相手は向こうが読み直す
      mutation.mutate(watchedSet.has(id) ? { action: 'unwatch', id } : { action: 'watch', id });
    },
    [mutation, watchedSet],
  );

  const moveWatch = useCallback(
    (id: string, toIndex: number) => {
      mutation.mutate({ action: 'move', id, toIndex });
    },
    [mutation],
  );

  return {
    visibleTabs,
    watched: watchedSet,
    candidates: json?.candidates ?? [],
    storedState,
    toggleWatch,
    moveWatch,
    error: mutation.error === null ? null : 'Failed to save watched projects',
  };
}
