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
} from '~/application/services/issues/avatar-cache.service.ts';

/* 顔を、こちらで読んで、こちらから返す。

   ここで見るのは 2 つ。**引ける先がいまの一覧に閉じていること**と、**同じ顔を何度も
   取りに行かないこと**である。前者を緩めると、この画面は任意の宛先へ代わりに取りに行く
   踏み台になる。後者を怠ると、30 枚のカードが 30 回上流を叩く。 */

/** 偽物の形は、ポートから引く。写して持つと、形が変わっても古いまま残る */
type Ledger = Parameters<ReturnType<typeof createAvatarCache>['remember']>[0];
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

describe('引ける顔は、いまの一覧が観測したものだけ', () => {
  it('観測した login は引ける', async () => {
    const scene = sceneOf();
    scene.cache.remember(
      ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1?s=48` }])]),
    );

    const answer = await scene.cache.read('hiroiku');

    expect(answer.kind).toBe('observed');
    expect(scene.asked[0]?.url).toBe(`${GITHUB}/u/1?s=48`);
  });

  it('観測していない login は、取りに行きもしない', async () => {
    const scene = sceneOf();
    scene.cache.remember(ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]));

    const answer = await scene.cache.read('octocat');

    expect(answer.kind, '知らない相手の顔は、無いのではなく引けない').toBe('absent');
    expect(scene.asked, '尋ねてしまえば、それは代わりに取りに行く踏み台である').toEqual([]);
  });

  it('一覧を取り直すと、居なくなった login は引けなくなる', async () => {
    const scene = sceneOf();
    scene.cache.remember(ledgerOf([issue([{ login: 'gone', avatarUrl: `${GITHUB}/u/9` }])]));
    scene.cache.remember(ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]));

    expect(
      (await scene.cache.read('gone')).kind,
      '足し続けると、もう観測していない顔がいつまでも引ける',
    ).toBe('absent');
  });

  it('GitHub 以外の宛先は、観測した URL でも覚えない', async () => {
    const scene = sceneOf();
    scene.cache.remember(
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

describe('同じ顔を何度も取りに行かない', () => {
  const remember = (scene: ReturnType<typeof sceneOf>) =>
    scene.cache.remember(ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]));

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
    scene.cache.remember(ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]));
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
    scene.cache.remember(ledgerOf([issue([{ login: 'hiroiku', avatarUrl: `${GITHUB}/u/1` }])]));

    expect(
      (await scene.cache.read('hiroiku')).kind,
      '取れなかったことを「そんな顔は無い」に潰さない',
    ).toBe('unobservable');
  });
});
