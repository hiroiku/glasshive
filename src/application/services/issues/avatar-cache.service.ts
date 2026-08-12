import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  AvatarImage,
  AvatarIntegration,
} from '~/application/ports/integrations/issues/avatar.integration.ts';
import type { GithubActor } from '~/domain/entities/issues/github-issue.entity.ts';
import type { IssueLedger } from '~/domain/entities/issues/issue.entity.ts';

/* 顔を、こちらで読んで、こちらから返す。

   **画面に GitHub の URL を渡さない。** 渡せば、課題を見ているだけでブラウザーが
   GitHub の CDN へつながる。渡すのは login だけで、そこから URL を引けるのはここである。

   引ける URL は**観測した一覧に実際に出てきたものだけ**にする。外から来た URL をそのまま
   取りに行くと、この画面は「任意の宛先へ代わりに取りに行く踏み台」になる。`?project=` で
   既に塞いだ穴と同じものである。

   覚えるのはメモリだけである。書くファイルは `preferences.json` ただ 1 つ、という構造を
   アバターごときで崩さない。 */

/** 顔を取ってくる相手。ここに載っていない宛先へは、観測した URL であっても行かない */
const ALLOWED_HOST = 'avatars.githubusercontent.com';

/** 覚えておく顔の数。1 枚 5KB 弱なので、これでも 1MB に届かない */
const MAX_REMEMBERED = 200;

/* 引ける宛先を覚えておくプロジェクトの数。
   どのプロジェクトが**いま開かれているか**を、ここから知る手立ては無い。だから最後に一覧した
   順で持ち、古いものから落とす。上限を置かないと、一度開いただけのプロジェクトの顔が
   いつまでも引けることになる。 */
export const MAX_REMEMBERED_PROJECTS = 8;

/* 一覧の外で観た宛先を覚えておく数。やり取り 1 件には多くても数十人しか出てこないので、
   これで何件ぶんかは残る。上限を置かないと、開いたことのある課題の人がいつまでも引ける。 */
export const MAX_DISCUSSED_LOGINS = 300;

/** 覚えた顔をもう一度確かめに行くまでの間。ブラウザーに言う `max-age` と同じにする */
export const AVATAR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Remembered {
  readonly image: AvatarImage;
  /** 最後に相手へ確かめた時刻 */
  readonly checkedAtMs: number;
}

export interface AvatarCacheService {
  /* そのプロジェクトで引ける顔を、観測した一覧で入れ替える。**観測していない顔は消える。**

     プロジェクトごとに入れ替える。このキャッシュは glasshive 全体で 1 つなので、1 枚の表を
     一覧のたびに入れ替えると、2 つのプロジェクトを開いた画面が互いの顔を消し合う。 */
  remember(projectPath: string, ledger: IssueLedger): void;
  /* 一覧の外で観た人を覚える。やり取りを開いたときに名指された人はここにしか居ない。

     **プロジェクトごとに入れ替えられない。** 一覧と違って観測し直す機会が無いので、
     入れ替える代わりに古いものから落とす。ここに入るのも、自分で観測した URL だけである。 */
  rememberActors(actors: readonly GithubActor[]): void;
  /** login 1 つぶんの顔。引けない login は `absent` */
  read(login: string): Promise<Observation<AvatarImage>>;
  /** 一覧に出てきた顔を、待たずに先に読んでおく */
  warm(ledger: IssueLedger): void;
}

/** 取ってきてよい URL か。宛先を確かめるのは、観測した値であっても変わらない */
function isAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === ALLOWED_HOST;
  } catch {
    return false;
  }
}

/** 一覧に出てくる人を全部。担当も書いた人も、顔を出す先は同じである */
function actorsOf(ledger: IssueLedger): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const issue of ledger.issues) {
    const github = issue.github;
    if (github === null) continue;
    for (const actor of [...github.assignees, github.author]) {
      if (actor === null || actor.avatarUrl === null) continue;
      if (!isAllowed(actor.avatarUrl)) continue;
      found.set(actor.login, actor.avatarUrl);
    }
  }
  return found;
}

export function createAvatarCache(deps: {
  readonly avatars: AvatarIntegration;
  readonly clock: { now(): number };
}): AvatarCacheService {
  /* 引いてよい宛先を、プロジェクトごとに持つ。**そのプロジェクトの一覧を取り直すたびに
     入れ替える。** 足し続けると、もう観測していない顔がいつまでも引けることになる。
     引くときは持っているプロジェクトの和を見るので、隣のプロジェクトの顔は消えない。 */
  const knownByProject = new Map<string, ReadonlyMap<string, string>>();
  /** 一覧の外 —— やり取りを開いたとき —— に観た宛先。古いものから落とす */
  const knownFromDiscussion = new Map<string, string>();
  const remembered = new Map<string, Remembered>();
  /* 同じ顔への求めを 1 本にまとめる。まとめないと、30 枚のカードが 30 回上流を叩く */
  const inFlight = new Map<string, Promise<Observation<AvatarImage>>>();

  /** 古いものから落とす。最後に触ったものを末尾へ寄せてある */
  const trim = () => {
    while (remembered.size > MAX_REMEMBERED) {
      const oldest = remembered.keys().next();
      if (oldest.done === true) break;
      remembered.delete(oldest.value);
    }
  };

  const fetchInto = async (login: string, url: string): Promise<Observation<AvatarImage>> => {
    const held = remembered.get(login);
    const answer = await deps.avatars.fetchAvatar({
      url,
      ifNoneMatch: held?.image.etag ?? null,
    });

    if (answer.kind !== 'observed') {
      /* 取ってこられなかった。**覚えてあるものが在れば、それを出す。**
         顔が出ないより古い顔のほうがまし、というのはここに限った話である —— 顔は
         誰なのかを言うだけで、状態を言わない。 */
      if (held !== undefined) return observed(held.image);
      return answer;
    }

    const image = answer.value.kind === 'unchanged' ? held?.image : answer.value.image;
    if (image === undefined) {
      // 変わっていないと言われたが、こちらは持っていない。次に尋ね直す
      return absent('empty');
    }
    // 触ったものを末尾へ寄せる。落とすときは先頭から
    remembered.delete(login);
    remembered.set(login, { image, checkedAtMs: deps.clock.now() });
    trim();
    return observed(image);
  };

  /* 観測した宛先。**どのプロジェクトの一覧で観たものでも引ける。**
     どのプロジェクトの画面から求められたのかは分からないので、持っているぶんの和を見る。
     和を見ても、ここに在るのは自分で観測した URL だけである。 */
  const urlOf = (login: string): string | undefined => {
    for (const known of knownByProject.values()) {
      const url = known.get(login);
      if (url !== undefined) return url;
    }
    return knownFromDiscussion.get(login);
  };

  const read = (login: string): Promise<Observation<AvatarImage>> => {
    const url = urlOf(login);
    // 観測していない login。引ける先が無いので、取りに行きもしない
    if (url === undefined) return Promise.resolve(absent('no-source'));

    const held = remembered.get(login);
    if (held !== undefined && deps.clock.now() - held.checkedAtMs < AVATAR_MAX_AGE_MS) {
      return Promise.resolve(observed(held.image));
    }

    const running = inFlight.get(login);
    if (running !== undefined) return running;

    const pending = fetchInto(login, url).finally(() => inFlight.delete(login));
    inFlight.set(login, pending);
    return pending;
  };

  return {
    rememberActors(actors) {
      for (const actor of actors) {
        if (actor.avatarUrl === null || !isAllowed(actor.avatarUrl)) continue;
        // 触ったものを末尾へ寄せる。落とすときは先頭から
        knownFromDiscussion.delete(actor.login);
        knownFromDiscussion.set(actor.login, actor.avatarUrl);
      }
      while (knownFromDiscussion.size > MAX_DISCUSSED_LOGINS) {
        const oldest = knownFromDiscussion.keys().next();
        if (oldest.done === true) break;
        knownFromDiscussion.delete(oldest.value);
      }
    },
    remember(projectPath, ledger) {
      // 触ったものを末尾へ寄せる。落とすときは先頭から
      knownByProject.delete(projectPath);
      knownByProject.set(projectPath, actorsOf(ledger));
      while (knownByProject.size > MAX_REMEMBERED_PROJECTS) {
        const oldest = knownByProject.keys().next();
        if (oldest.done === true) break;
        knownByProject.delete(oldest.value);
      }
    },
    read,
    warm(ledger) {
      /* 待たない。**顔が取れないことで一覧が遅れてはいけない。**
         取れた頃にはブラウザーが求めに来るので、そのときメモリに在ればよい。 */
      for (const login of actorsOf(ledger).keys()) void read(login);
    },
  };
}
