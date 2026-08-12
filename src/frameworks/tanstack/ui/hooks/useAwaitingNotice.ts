import { useEffect, useRef } from 'react';
import type { TreeJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { useT } from '../i18n/useT.ts';

/* 「あなたの返事待ち」に変わったことを、画面を見ていないユーザーへ知らせる。

   **変わった瞬間だけ知らせる。** 待っている状態が続いているあいだ鳴らし続けると、
   知らせが騒音になって切られる。

   最初の一巡では鳴らさない。開いた瞬間に、既に待っていた分が全部鳴ってしまう。

   画面を見ているときも鳴らさない。目の前に出ているものを、わざわざ横から言わない。 */

export function useAwaitingNotice(tree: TreeJson | undefined, enabled: boolean): void {
  const t = useT();
  const previousRef = useRef(new Map<string, string | null>());

  useEffect(() => {
    if (tree === undefined) return;
    /* 途中の木では動かさない。**鳴らした知らせは取り消せない。**

       読めたプロジェクトから順に届くので、途中で動かすと 2 つ目のプロジェクトが届いた
       時点で「1 巡目ではない」と見えてしまい、開いた瞬間に既に待っていた分が全部鳴る。
       控えのほうも埋めない — 埋めると、最初の完全な木が「何も変わっていない」に見える。 */
    if (!tree.complete) return;
    const previous = previousRef.current;
    const first = previous.size === 0;

    for (const project of tree.projects) {
      for (const session of project.sessions) {
        const was = previous.get(session.file);
        const becameAwaiting = session.awaiting === 'user' && was !== 'user';
        if (!first && enabled && becameAwaiting && !document.hasFocus()) {
          try {
            new Notification(t('{project}: awaiting your input', { project: project.name }), {
              body: session.title ?? session.id.slice(0, 8),
            });
          } catch {
            // 知らせを出せない環境では黙って諦める
          }
        }
        previous.set(session.file, session.awaiting);
      }
    }
  }, [tree, enabled, t]);
}

/** 知らせを使ってよいかを尋ねる。断られたら入れない */
export async function requestNoticePermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  return (await Notification.requestPermission()) === 'granted';
}
