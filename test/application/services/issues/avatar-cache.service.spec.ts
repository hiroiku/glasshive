import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type {
  AvatarIntegration,
  AvatarRequest,
} from '~/application/ports/integrations/issues/avatar.integration.ts';
import {
  AVATAR_MAX_AGE_MS,
  createAvatarCache,
  MAX_DISCUSSED_LOGINS,
  MAX_REMEMBERED_PROJECTS,
} from '~/application/services/issues/avatar-cache.service.ts';

/* 顔を、こちらで読んで、こちらから返す。

   ここで見るのは 3 つ。**引ける先が観測した一覧に閉じていること**と、**プロジェクトどうしが
   互いの顔を消さないこと**と、**同じ顔を何度も取りに行かないこと**である。1 つめを緩めると、
   この画面は任意の宛先へ代わりに取りに行く踏み台になる。2 つめを怠ると、2 つ開いた画面の
   片方から顔が消える。3 つめを怠ると、30 枚のカードが 30 回上流を叩く。 */

/** 偽物の形は、ポートから引く。写して持つと、形が変わっても古いまま残る */
type Ledger = Parameters<ReturnType<typeof createAvatarCache>['remember']>[1];
type Issue = Ledger['issues'][number];

class Unreachable extends AppError {
  readonly code = 'avatar.unreachable';
}

const GITHUB = 'https://avatars.githubusercontent.com';

const issue = (assignees: readonly { login: string; avatarUrl: string | null }[]): Issue =>
  ({
    id: '#1',
    title: 'x',
    status: 'open',
    issueType: null,
    labels: null,
    assignee: null,
    createdAt: null,
    updatedAt: null,
    closedAt: null,
    deps: [],
    depsComplete: true,
    github: {
      url: null,
      labels: [],
      assignees,
      author: null,
      milestone: null,
      issueTypeColor: null,
      subIssues: null,
      pullRequests: [],
      comments: 0,
      reactions: 0,
    },
  }) as Issue;

const ledgerOf = (issues: readonly Issue[]): Ledger =>
  ({ issues, counts: {}, truncated: false }) as Ledger;

/** 尋ねられた回数と中身を控える偽物。**何回叩いたかそのものが確かめたいこと** */
function spyAvatars(answers?: { etag?: string | null; fail?: boolean; unchanged?: boolean }) {
  const asked: AvatarRequest[] = [];
  const avatars: AvatarIntegration = {
    async fetchAvatar(request) {
      asked.push(request);
      if (answers?.fail === true) return unobservable(new Unreachable('繋がらない'));
      if (answers?.unchanged === true) return observed({ kind: 'unchanged' });
      return observed({
        kind: 'image',
        image: {
          bytes: new ArrayBuffer(4),
          contentType: 'image/png',
          etag: answers?.etag ?? '"abc"',
        },
      });
    },
  };
  return { avatars, asked };
}

function sceneOf(options?: Parameters<typeof spyAvatars>[0]) {
  const spy = spyAvatars(options);
  let nowMs = 1_700_000_000_000;
  const cache = createAvatarCache({ avatars: spy.avatars, clock: { now: () => nowMs } });
  return { ...spy, cache, advance: (ms: number) => (nowMs += ms) };
}

describe('引ける顔は、観測した一覧に出たものだけ', () => {
  it('観測した login は引ける', async () => {
    const scene = sceneOf();
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1?s=48` }])]),
    );

    const answer = await scene.cache.read('hiroiku');

    expect(answer.kind).toBe('observed');
    expect(scene.asked[0]?.url).toBe(`${GITHUB}/u/1?s=48`);
  });

  it('観測していない login は、取りに行きもしない', async () => {
    const scene = sceneOf();
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]),
    );

    const answer = await scene.cache.read('octocat');

    expect(answer.kind, '知らない相手の顔は、無いのではなく引けない').toBe('absent');
    expect(scene.asked, '尋ねてしまえば、それは代わりに取りに行く踏み台である').toEqual([]);
  });

  it('同じプロジェクトの一覧を取り直すと、居なくなった login は引けなくなる', async () => {
    const scene = sceneOf();
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'gone', avatarUrl: `${GITHUB}/u/9` }])]),
    );
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]),
    );

    expect(
      (await scene.cache.read('gone')).kind,
      '足し続けると、もう観測していない顔がいつまでも引ける',
    ).toBe('absent');
  });

  it('GitHub 以外の宛先は、観測した URL でも覚えない', async () => {
    const scene = sceneOf();
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([
        issue([
          { login: 'evil', avatarUrl: 'https://internal.test/secret' },
          { login: 'plain', avatarUrl: `http://avatars.githubusercontent.com/u/2` },
          { login: 'nowhere', avatarUrl: null },
        ]),
      ]),
    );

    for (const login of ['evil', 'plain', 'nowhere']) {
      expect((await scene.cache.read(login)).kind, `${login} は引けてはならない`).toBe('absent');
    }
    expect(scene.asked, '宛先を確かめるのは、観測した値であっても変わらない').toEqual([]);
  });
});

describe('プロジェクトどうしが、互いの顔を消さない', () => {
  const face = (login: string, id: number) =>
    ledgerOf([issue([{ login, avatarUrl: `${GITHUB}/u/${id}` }])]);

  it('別のプロジェクトを一覧しても、先に観測したプロジェクトの顔は引ける', async () => {
    const scene = sceneOf();
    scene.cache.remember('/work/glasshive', face('hiroiku', 1));
    scene.cache.remember('/work/kuden-drive', face('octocat', 2));

    expect(
      (await scene.cache.read('hiroiku')).kind,
      'キャッシュは全部のプロジェクトで 1 つなので、丸ごと入れ替えると 2 つ開いた画面が取り合う',
    ).toBe('observed');
    expect((await scene.cache.read('octocat')).kind).toBe('observed');
  });

  it('取り直しが交互に来ても、どちらの顔も引けるままである', async () => {
    const scene = sceneOf();
    for (let round = 0; round < 3; round++) {
      scene.cache.remember('/work/glasshive', face('hiroiku', 1));
      scene.cache.remember('/work/kuden-drive', face('octocat', 2));
    }

    expect(
      (await scene.cache.read('hiroiku')).kind,
      '変更通知のたびに両方が取り直す。後から来た一覧で引ける顔が決まると、先の顔が消える',
    ).toBe('observed');
    expect((await scene.cache.read('octocat')).kind).toBe('observed');
  });

  it('覚えておくプロジェクトの数には上限がある', async () => {
    const scene = sceneOf();
    scene.cache.remember('/work/old', face('gone', 9));
    for (let index = 0; index < MAX_REMEMBERED_PROJECTS; index++) {
      scene.cache.remember(`/work/p${index}`, face(`user${index}`, index));
    }

    expect(
      (await scene.cache.read('gone')).kind,
      '際限なく足すと、もう開いていないプロジェクトの顔がいつまでも引ける',
    ).toBe('absent');
    expect((await scene.cache.read('user0')).kind, '直近のプロジェクトは引ける').toBe('observed');
  });
});

describe('同じ顔を何度も取りに行かない', () => {
  const remember = (scene: ReturnType<typeof sceneOf>) =>
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]),
    );

  it('覚えている間は上流に尋ねない', async () => {
    const scene = sceneOf();
    remember(scene);

    await scene.cache.read('hiroiku');
    await scene.cache.read('hiroiku');

    expect(scene.asked).toHaveLength(1);
  });

  it('同時に求められても、上流は 1 回しか叩かない', async () => {
    const scene = sceneOf();
    remember(scene);

    await Promise.all([
      scene.cache.read('hiroiku'),
      scene.cache.read('hiroiku'),
      scene.cache.read('hiroiku'),
    ]);

    expect(scene.asked, '30 枚のカードが 30 回叩くと、顔のために一覧が止まる').toHaveLength(1);
  });

  it('期限が過ぎたら、覚えている `ETag` を付けて尋ね直す', async () => {
    const scene = sceneOf({ etag: '"v1"' });
    remember(scene);
    await scene.cache.read('hiroiku');

    scene.advance(AVATAR_MAX_AGE_MS + 1);
    await scene.cache.read('hiroiku');

    expect(scene.asked).toHaveLength(2);
    expect(scene.asked[0]?.ifNoneMatch, '初めて尋ねるときは付けようが無い').toBe(null);
    expect(scene.asked[1]?.ifNoneMatch, '変わっていなければ本文は返ってこない').toBe('"v1"');
  });
});

describe('顔が取れなかったとき', () => {
  it('覚えている顔が在れば、それを出す', async () => {
    const scene = sceneOf();
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]),
    );
    await scene.cache.read('hiroiku');

    /* 次は繋がらない。**顔は誰なのかを言うだけで、状態を言わない** ——
       だから古い顔を出してよい。稼働の欄なら、これは許されない。 */
    const offline = sceneOf({ fail: true });
    scene.avatars.fetchAvatar = offline.avatars.fetchAvatar;
    scene.advance(AVATAR_MAX_AGE_MS + 1);

    expect((await scene.cache.read('hiroiku')).kind).toBe('observed');
  });

  it('一度も取れていなければ、取れなかったと言う', async () => {
    const scene = sceneOf({ fail: true });
    scene.cache.remember(
      '/work/glasshive',
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]),
    );

    expect(
      (await scene.cache.read('hiroiku')).kind,
      '取れなかったことを「そんな顔は無い」に潰さない',
    ).toBe('unobservable');
  });
});

/* やり取りを開いたときに名指された人。**一覧には居ない** —— 一覧が持つのは担当と書いた人
   だけなので、ラベルを付けた人も改題した人もここでしか観測できない。

   一覧と違って観測し直す機会が無いので、プロジェクトごとに入れ替える代わりに古いものから
   落とす。入れ替えないからといって、宛先の決まりが緩むわけではない。 */
describe('やり取りで観た顔も引ける', () => {
  it('一覧に居ない人でも、やり取りで観たなら引ける', async () => {
    const scene = sceneOf();
    scene.cache.rememberActors([{ login: 'octocat', avatarUrl: `${GITHUB}/u/7?s=48` }]);

    const answer = await scene.cache.read('octocat');

    expect(answer.kind, '一覧に居ないだけで顔が出ないと、イベントの行だけ顔が抜ける').toBe(
      'observed',
    );
    expect(scene.asked[0]?.url).toBe(`${GITHUB}/u/7?s=48`);
  });

  it('一覧を取り直しても、やり取りで観た顔は消えない', async () => {
    const scene = sceneOf();
    scene.cache.rememberActors([{ login: 'octocat', avatarUrl: `${GITHUB}/u/7` }]);
    scene.cache.remember('/work/glasshive', ledgerOf([]));

    expect(
      (await scene.cache.read('octocat')).kind,
      'プロジェクトごとの入れ替えは、一覧で観たぶんの話である',
    ).toBe('observed');
  });

  /* 宛先の決まりは、どこで観たかで変わらない。**観測した値であっても宛先は確かめる** ——
     確かめなければ、この画面は任意の宛先へ代わりに取りに行く踏み台になる。 */
  it('GitHub の外を指す URL は、やり取りで観ても引かない', async () => {
    const scene = sceneOf();
    scene.cache.rememberActors([
      { login: 'evil', avatarUrl: 'https://example.com/u/1' },
      { login: 'plain', avatarUrl: 'http://avatars.githubusercontent.com/u/2' },
      { login: 'faceless', avatarUrl: null },
    ]);

    expect((await scene.cache.read('evil')).kind).toBe('absent');
    expect((await scene.cache.read('plain')).kind, 'https でなければ引かない').toBe('absent');
    expect((await scene.cache.read('faceless')).kind).toBe('absent');
    expect(scene.asked, '1 つでも尋ねていれば、そこが踏み台である').toEqual([]);
  });

  it('覚える数に上限が在り、古いものから落ちる', async () => {
    const scene = sceneOf();
    scene.cache.rememberActors([{ login: 'first', avatarUrl: `${GITHUB}/u/0` }]);
    scene.cache.rememberActors(
      Array.from({ length: MAX_DISCUSSED_LOGINS }, (_, index) => ({
        login: `later${index}`,
        avatarUrl: `${GITHUB}/u/${index + 1}`,
      })),
    );

    expect(
      (await scene.cache.read('first')).kind,
      '上限が無いと、一度開いた課題の人がいつまでも引ける',
    ).toBe('absent');
    expect((await scene.cache.read('later0')).kind).toBe('observed');
  });
});
