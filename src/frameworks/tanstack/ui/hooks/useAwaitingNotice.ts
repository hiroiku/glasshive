import { useEffect, useRef } from 'react';
import type { TreeJson } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 「あなたの返事待ち」に変わったことを、画面を観ていない人へ知らせる。

   **変わった瞬間だけ知らせる。** 待っている状態が続いているあいだ鳴らし続けると、
   知らせが騒音になって切られる。

   **最初の一巡では鳴らさない。** 開いた瞬間に、既に待っていた分が全部鳴る。

   **画面を観ているときは鳴らさない。** 目の前に出ているものを、わざわざ横から言わない。 */

export function useAwaitingNotice(tree: TreeJson | undefined, enabled: boolean): void {
  const previousRef = useRef(new Map<string, string | null>());

  useEffect(() => {
    if (tree === undefined) return;
    const previous = previousRef.current;
    const first = previous.size === 0;

    for (const project of tree.projects) {
      for (const session of project.sessions) {
        const was = previous.get(session.file);
        const becameAwaiting = session.awaiting === 'user' && was !== 'user';
        if (!first && enabled && becameAwaiting && !document.hasFocus()) {
          try {
            new Notification(`${project.name}: あなたの返事を待っています`, {
              body: session.title ?? session.id.slice(0, 8),
            });
          } catch {
            // 知らせを出せない環境では黙って諦める
          }
        }
        previous.set(session.file, session.awaiting);
      }
    }
  }, [tree, enabled]);
}

/** 知らせを使ってよいかを尋ねる。断られたら入れない */
export async function requestNoticePermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  return (await Notification.requestPermission()) === 'granted';
}
