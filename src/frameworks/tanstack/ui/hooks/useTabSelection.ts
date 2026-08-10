import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { TabAction } from '~/interface/controllers/workspace/preferences.controller.ts';
import type { PreferencesJson } from '~/interface/presenters/workspace/preferences.presenter.ts';
import { setPreferences } from '../../functions/preferences.ts';
import { preferencesQuery, preferencesQueryKey } from '../../queries/preferences.query.ts';
import { applyTabAction, type TabSelectionJson } from '../derive/tab-selection.ts';

/* ピン留めの読み書きを、画面から使える形にまとめる。

   **送るのは「何をしたいか」だけである。** 選択の全体を送ると、読んでから送るまでの間に
   別のクライアントが留めたぶんが黙って消える。読む・当てる・置くは向こう側で 1 つの操作に
   閉じてある。

   押した手応えを待たせないため、置きに行く前にクライアント側の状態を差し替える。留めるのは
   自分の画面の並べ替えでしかなく、観測を待つ理由が無い。置けなかったときは元へ戻す。 */

/** `preferences.json` がまだ届いていない間の見た目。留めていないことにするだけで、何も置かない */
const EMPTY_SELECTION: TabSelectionJson = {
  version: 1,
  mode: 'all',
  pinned: [],
  hidden: [],
};

export interface TabSelectionHandle {
  readonly selection: TabSelectionJson;
  /** タブに出す id。ピン留めの一覧そのものとは別 — 観測に在るものだけが並ぶ */
  readonly visibleTabs: readonly string[];
  readonly pinned: ReadonlySet<string>;
  /** `preferences.json` を読めたか。既定へ倒れた理由をユーザーへ伝えるために持つ */
  readonly storedState: PreferencesJson['stored']['state'];
  readonly togglePin: (id: string) => void;
  readonly movePin: (id: string, toIndex: number) => void;
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
         差し替えた見た目がそのまま残り、次に開いたときにピン留めが黙って消える。 */
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
          tab_selection: applyTabAction(previous.tab_selection, action),
          /* **タブ行はここでは動かさない。** 何が並ぶかは観測にあるかで決まり、
             それを知っているのは向こう側だけである。結果が返ったときに揃う。 */
        });
      }
      return { previous };
    },

    onError: (_error, _action, context) => {
      // 置けなかったのにピン留めだけ残ると、次に開いたとき黙って消える
      if (context?.previous !== undefined) {
        client.setQueryData(preferencesQueryKey, context.previous);
      }
    },

    onSuccess: (saved) => client.setQueryData(preferencesQueryKey, saved),
  });

  const selection = json?.tab_selection ?? EMPTY_SELECTION;
  const pinnedSet = useMemo(() => new Set(selection.pinned), [selection.pinned]);

  /* `preferences.json` をどう読めたか。**取りに行って落ちたのは、留めたものが無いこととは違う。**
     ここを一律に `absent` へ倒すと、一度も結果を受け取れていない画面が
     「まだ何も留めていない」と表示し、ユーザーにはピン留めが黙って消えたようにしか見えない。
     まだ届いていないだけの間は倒してよい — 画面はその間なにも言わず、届けば入れ替わる。 */
  const storedState: PreferencesJson['stored']['state'] =
    json?.stored.state ?? (query.error === null ? 'absent' : 'unobservable');

  const togglePin = useCallback(
    (id: string) => {
      // どちらの操作かはクライアント側の見た目で決める。当てる相手は向こうが読み直す
      mutation.mutate(pinnedSet.has(id) ? { action: 'unpin', id } : { action: 'pin', id });
    },
    [mutation, pinnedSet],
  );

  const movePin = useCallback(
    (id: string, toIndex: number) => {
      mutation.mutate({ action: 'move', id, toIndex });
    },
    [mutation],
  );

  return {
    selection,
    visibleTabs: json?.visible_tabs ?? [],
    pinned: pinnedSet,
    storedState,
    togglePin,
    movePin,
    error: mutation.error === null ? null : 'Failed to save pinned tabs',
  };
}
