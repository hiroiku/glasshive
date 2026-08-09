import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { TabAction } from '~/interface/controllers/workspace/preferences.controller.ts';
import type { PreferencesJson } from '~/interface/presenters/workspace/preferences.presenter.ts';
import { setPreferences } from '../../functions/preferences.ts';
import { preferencesQuery, preferencesQueryKey } from '../../queries/preferences.query.ts';
import { applyTabAction, type TabSelectionJson } from '../derive/tab-selection.ts';

/* 留めたものの読み書きを、画面から使える形にまとめる。

   **送るのは「何をしたいか」だけである。** 丸ごとの選びを送ると、読んでから送るまでの間に
   別の窓が留めたぶんが黙って消える。読む・当てる・置くは向こう側で 1 つの行いに閉じてある。

   **押した手応えを待たせない。** 置きに行く前に手元の写しを差し替える。留めるという操作は
   自分の机を並べ替えているだけで、観測を待つ理由が無い。置けなかったときは元へ戻す。 */

/** 覚え書きがまだ届いていない間の見た目。留めていないことにするだけで、何も置かない */
const EMPTY_SELECTION: TabSelectionJson = {
  version: 1,
  mode: 'all',
  pinned: [],
  hidden: [],
};

export interface TabSelectionHandle {
  readonly selection: TabSelectionJson;
  /** タブに出す id。留めた印そのものとは別 — 観測に在るものだけが並ぶ */
  readonly visibleTabs: readonly string[];
  readonly pinned: ReadonlySet<string>;
  /** 覚え書きを読めたか。既定へ倒れた理由を観る人へ伝えるために持つ */
  readonly storedState: PreferencesJson['stored']['state'];
  readonly togglePin: (id: string) => void;
  readonly movePin: (id: string, toIndex: number) => void;
  /** 置きに行って断られたときの言い分。通っているときは `null` */
  readonly error: string | null;
}

export function useTabSelection(): TabSelectionHandle {
  const client = useQueryClient();
  const query = useQuery(preferencesQuery);
  const json = query.data;

  const mutation = useMutation({
    mutationFn: async (action: TabAction) => {
      const response = await setPreferences({ data: action });
      /* 断られたことを、待っている側の誤りの道へ載せる。載せずに通ったことにすると、
         差し替えた見た目がそのまま残り、次に開いたときに印が黙って消える。 */
      if (!response.ok) throw new Error(response.body.message);
      return response.body;
    },

    /* 置きに行く前に手元を差し替える。戻すための前の写しを添えて返す。 */
    onMutate: async (action) => {
      await client.cancelQueries({ queryKey: preferencesQueryKey });
      const previous = client.getQueryData<PreferencesJson>(preferencesQueryKey);
      if (previous !== undefined) {
        client.setQueryData<PreferencesJson>(preferencesQueryKey, {
          ...previous,
          tab_selection: applyTabAction(previous.tab_selection, action),
          /* **タブ行はここでは動かさない。** 何が並ぶかは観測に在るかで決まり、
             それを知っているのは向こう側だけである。答えが返ったときに揃う。 */
        });
      }
      return { previous };
    },

    onError: (_error, _action, context) => {
      // 置けなかったのに印だけ残ると、次に開いたとき黙って消える
      if (context?.previous !== undefined) {
        client.setQueryData(preferencesQueryKey, context.previous);
      }
    },

    onSuccess: (saved) => client.setQueryData(preferencesQueryKey, saved),
  });

  const selection = json?.tab_selection ?? EMPTY_SELECTION;
  const pinnedSet = useMemo(() => new Set(selection.pinned), [selection.pinned]);

  /* 覚え書きをどう読めたか。**取りに行って落ちたのは、留めたものが無いことではない。**
     ここを一律に `absent` へ倒すと、一度も答えを受け取れていない画面が
     「まだ何も留めていない」と名乗り、観る人には印が黙って消えたようにしか見えない。
     まだ届いていないだけの間は倒してよい — 画面はその間なにも言わず、届けば入れ替わる。 */
  const storedState: PreferencesJson['stored']['state'] =
    json?.stored.state ?? (query.error === null ? 'absent' : 'unobservable');

  const togglePin = useCallback(
    (id: string) => {
      // どちらの申し出かは手元の見た目で決める。当てる相手は向こうが読み直す
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
    error: mutation.error === null ? null : '留めた印を置けませんでした',
  };
}
