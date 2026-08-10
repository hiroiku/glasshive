import {
  mdiCogOutline,
  mdiSubdirectoryArrowLeft,
  mdiThoughtBubbleOutline,
  mdiWrenchOutline,
} from '@mdi/js';
import type { EventJson } from '~/interface/presenters/sessions/conversation.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { cut } from '../../format.ts';
import { highlight } from '../../markdown.ts';
import { Icon } from '../primitives/Icon.tsx';
import { MdView } from '../text/MdView.tsx';

/* 会話の 1 イベント。

   人の発言は吹き出しとして開いたまま、ツールのやりとりは畳んで 1 行にする。
   畳まないと、ツールの入出力が会話を埋めて、誰が何を言ったのかが読めなくなる。

   **列は `#conversation` が決めている。** `summary` を `display: contents` にして
   アイコン・名前・プレビューを親の列へ直に流し込んでいるので、ラッパーを増やせない。 */

const KIND_ICON: Record<string, string> = {
  tool_use: mdiWrenchOutline,
  tool_result: mdiSubdirectoryArrowLeft,
  thinking: mdiThoughtBubbleOutline,
  system: mdiCogOutline,
};

/** 畳んだ 1 行に出すプレビューの長さ */
const PREVIEW_CHARS = 90;

export function EventView({
  event,
  project,
}: {
  event: EventJson;
  project: ProjectJson | undefined;
}) {
  return (
    <div className={`event ${event.role}`}>
      {/* 時刻の欄はイベントの全行に跨がらせる — 本文の高さぶん貼り付いていられるように */}
      {event.ts !== null && (
        <span
          className="ts"
          title={event.ts}
          style={{ gridRow: `1 / span ${Math.max(1, event.blocks.length)}` }}
        >
          {event.ts.slice(11, 19)}
        </span>
      )}

      {event.blocks.map((block, index) => {
        const key = `${index}:${block.kind}`;
        if (block.kind === 'text') {
          return (
            <MdView key={key} className="bubble speech md" text={block.text} project={project} />
          );
        }

        /* `tool_use` は 2 行目からプレビューする。1 行目は括弧だけで中身が無い。
           `tool_result` のほうは空白を潰して 1 行にする。 */
        const icon = KIND_ICON[block.kind];
        const preview =
          block.kind === 'tool_use'
            ? cut(block.text.split('\n').slice(1, 2).join('').trim(), PREVIEW_CHARS)
            : cut(block.text.replace(/\s+/g, ' '), PREVIEW_CHARS);

        return (
          <details key={key} className={`blk ${block.kind}`}>
            <summary>
              <span className="blk-ico">
                {icon === undefined ? '·' : <Icon path={icon} size={12} />}
              </span>
              {(block.kind === 'tool_use' || block.kind === 'system') && (
                <span className="blk-name" title={block.name ?? undefined}>
                  {block.name ?? 'system'}
                </span>
              )}
              {block.kind === 'thinking' && <span className="blk-name">thinking</span>}
              {block.kind === 'tool_result' && <span className="blk-name">result</span>}
              <span className="blk-prev">{preview}</span>
            </summary>
            {block.kind === 'tool_use' ? (
              <pre>
                {/* ツールへの入力は JSON として組んである。ハイライトした結果はエスケープ済み */}
                <code
                  className="hljs"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight はハイライト済みの HTML か、エスケープした文字列のどちらかしか返さない
                  dangerouslySetInnerHTML={{
                    __html: highlight(block.text, 'json'),
                  }}
                />
              </pre>
            ) : (
              <pre>{block.text}</pre>
            )}
          </details>
        );
      })}
    </div>
  );
}
