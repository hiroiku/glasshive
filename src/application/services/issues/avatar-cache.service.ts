import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  AvatarImage,
  AvatarIntegration,
} from '~/application/ports/integrations/issues/avatar.integration.ts';
import type { IssueLedger } from '~/domain/entities/issues/issue.entity.ts';

/* 顔を、こちらで読んで、こちらから返す。

   **画面に GitHub の URL を渡さない。** 渡せば、課題を見ているだけでブラウザーが
   GitHub の CDN へつながる。渡すのは login だけで、そこから URL を引けるのはここである。

   引ける URL は**いまの一覧が実際に観測したものだけ**にする。外から来た URL をそのまま
   取りに行くと、この画面は「任意の宛先へ代わりに取りに行く踏み台」になる。`?project=` で
   既に塞いだ穴と同じものである。

   覚えるのはメモリだけである。書くファイルは `preferences.json` ただ 1 つ、という構造を
   アバターごときで崩さない。 */

/** 顔を取ってくる相手。ここに載っていない宛先へは、観測した URL であっても行かない */
const ALLOWED_HOST = 'avatars.githubusercontent.com';

/** 覚えておく顔の数。1 枚 5KB 弱なので、これでも 1MB に届かない */
const MAX_REMEMBERED = 200;

/** 覚えた顔をもう一度確かめに行くまでの間。ブラウザーに言う `max-age` と同じにする */
export const AVATAR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Remembered {
  readonly image: AvatarImage;
  /** 最後に相手へ確かめた時刻 */
  readonly checkedAtMs: number;
}

export interface AvatarCacheService {
  /** 観測した一覧から、引ける顔を入れ替える。**観測していない顔は消える** */
  remember(ledger: IssueLedger): void;
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
  /* 引いてよい宛先。**一覧を取り直すたびに入れ替える。**
     足し続けると、もう観測していない顔がいつまでも引けることになる。 */
  let known: ReadonlyMap<string, string> = new Map();
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

  const read = (login: string): Promise<Observation<AvatarImage>> => {
    const url = known.get(login);
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
    remember(ledger) {
      known = actorsOf(ledger);
    },
    read,
    warm(ledger) {
      /* 待たない。**顔が取れないことで一覧が遅れてはいけない。**
         取れた頃にはブラウザーが求めに来るので、そのときメモリに在ればよい。 */
      for (const login of actorsOf(ledger).keys()) void read(login);
    },
  };
}
