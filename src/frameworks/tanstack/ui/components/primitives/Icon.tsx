/* 印は絵文字ではなく形で描く。

   絵文字は環境ごとに姿も幅も違うので、列の幅が機械によって動く。形なら
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
  /* 名前の有無で分けて書く。1 つにまとめて印を出し入れすると、
     読む側にも検める側にも「名前のある絵」なのか「飾り」なのかが見えない。 */
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

/** 字として組み立てた印の中へ埋め込む用。React を置けない場所でだけ使う */
export const iconHtml = (path: string, size = 11): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="mdi" aria-hidden="true"><path d="${path}" fill="currentColor"/></svg>`;
