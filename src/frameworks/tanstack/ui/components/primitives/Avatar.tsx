import type { GithubActorJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { monogram } from '../../derive/githubIssue.ts';

/* 担当の顔。

   **頭文字を下に敷いて、その上に画像を重ねる。** 顔が取れなければ画像が描かれないだけで、
   下の頭文字がそのまま残る。JavaScript も、状態も、場所の揺れも要らない。

   画像の取得先は同じ origin である。GitHub の CDN を直に指すと、画面が GitHub へ
   つながってしまう —— 機械から外へつながる先は、`gh` の 1 か所だけにしてある。 */

/** 顔を出す大きさ。取ってくるのは倍の 48px 1 枚だけで、縮めて描く */
const SIZE = 18;

export function Avatar({ actor }: { actor: GithubActorJson }) {
  return (
    <span className="av" title={actor.login} aria-hidden="true">
      {monogram(actor.login)}
      {actor.avatar !== null && (
        <img
          src={`/api/avatar/${encodeURIComponent(actor.avatar)}`}
          alt=""
          width={SIZE}
          height={SIZE}
          loading="lazy"
          decoding="async"
        />
      )}
    </span>
  );
}

/** 担当が何人か居るときの重ね。**人数そのものは隠さない** */
export function AvatarStack({
  actors,
  max,
}: {
  readonly actors: readonly GithubActorJson[];
  readonly max: number;
}) {
  if (actors.length === 0) return null;
  const shown = actors.slice(0, max);
  const rest = actors.length - shown.length;
  return (
    <span className="av-stack" title={actors.map((actor) => actor.login).join(', ')}>
      {shown.map((actor) => (
        <Avatar key={actor.login} actor={actor} />
      ))}
      {rest > 0 && <span className="g-more">+{rest}</span>}
    </span>
  );
}
