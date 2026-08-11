import type { GithubActorJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { monogram } from '../../derive/githubIssue.ts';

/* 担当の顔。

   **頭文字を下に敷いて、その上に画像を重ねる。** 顔が取れなければ画像が描かれないだけで、
   下の頭文字がそのまま残る。JavaScript も、状態も、場所の揺れも要らない。

   画像の取得先は同じ origin である。GitHub の CDN を直に指すと、画面が GitHub へ
   つながってしまう —— 機械から外へつながる先は、`gh` の 1 か所だけにしてある。

   **顔は誰かを名乗る。** 顔だけが置かれている欄で名前を伏せると、担当が居ないときの `—` と
   区別が付かなくなる。`title` は名前の代わりにならない —— 触って使う画面では出ない。
   名前が隣に文字で並んでいる呼び出しだけ `decorative` で伏せて、二重に読ませない。 */

/** 顔を出す大きさ。取ってくるのは倍の 48px 1 枚だけで、縮めて描く */
const SIZE = 18;

export function Avatar({
  actor,
  decorative = false,
}: {
  readonly actor: GithubActorJson;
  readonly decorative?: boolean;
}) {
  return (
    <span
      className="av"
      title={actor.login}
      role="img"
      aria-label={actor.login}
      /* 伏せるのは `aria-hidden` だけにする。名前はいつも付けておく —— 名乗る側と
         伏せる側で組み立てが分かれると、伏せたつもりの呼び出しが名前ごと消える */
      aria-hidden={decorative ? 'true' : undefined}
    >
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

/* 担当が何人か居るときの重ね。**人数そのものは隠さない**

   重ね全体で 1 つの名前を名乗る。中の顔を 1 つずつ名乗らせると、`max` で溢れた人が
   `+2` としか読まれない —— 溢れた人の名前もここに入れて、目に見えている数より
   多く言う側に倒す。 */
export function AvatarStack({
  actors,
  max,
  decorative = false,
}: {
  readonly actors: readonly GithubActorJson[];
  readonly max: number;
  readonly decorative?: boolean;
}) {
  if (actors.length === 0) return null;
  const shown = actors.slice(0, max);
  const rest = actors.length - shown.length;
  const logins = actors.map((actor) => actor.login).join(', ');
  return (
    <span
      className="av-stack"
      title={logins}
      role="img"
      aria-label={logins}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {shown.map((actor) => (
        <Avatar key={actor.login} actor={actor} decorative />
      ))}
      {rest > 0 && <span className="g-more">+{rest}</span>}
    </span>
  );
}
