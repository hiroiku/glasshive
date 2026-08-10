/* アイコンは絵文字ではなく SVG のパスで描く。

   絵文字は環境ごとに見た目も幅も違うので、列の幅が機械によって動く。SVG なら
   どこでも同じに出て、`currentColor` でその場の色に馴染む。 */

export function Icon({
  path,
  size = 13,
  className = '',
  title,
}: {
  path: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  /* `title` の有無で 2 通りを書き分ける。1 つの svg で属性を出し入れすると、
     読む側にも検証する側にも「名前のある画像」なのか「装飾」なのかが見えない。 */
  if (title === undefined) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={`mdi ${className}`}
        aria-hidden="true"
      >
        <path d={path} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`mdi ${className}`} role="img">
      <title>{title}</title>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/** 文字列として組み立てた HTML の中へ埋め込む用。React を置けない場所でだけ使う */
export const iconHtml = (path: string, size = 11): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="mdi" aria-hidden="true"><path d="${path}" fill="currentColor"/></svg>`;
