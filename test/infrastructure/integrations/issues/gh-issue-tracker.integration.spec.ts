import { describe, expect, it } from 'vitest';
import { createGhIssueTrackerIntegration } from '~/infrastructure/integrations/issues/gh-issue-tracker.integration.ts';

/** `execFile` が投げるエラーの形を真似る。起動できなかったときは `code` が errno の文字列 */
const errnoError = (code: string): Error => Object.assign(new Error('spawn failed'), { code });

/** 非ゼロで終わったときは `code` が終了コード(数値)になる */
const exitError = (status: number, stderr: string): Error =>
  Object.assign(new Error('command failed'), { code: status, stderr });

const request = { owner: 'hiroiku', name: 'glasshive', cursor: null, pageSize: 100 };

describe('gh に課題を尋ねる', () => {
  it('owner と名前を、問い合わせの文字列に埋めずに渡す', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssuePage(request);

    expect(seen.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(
      seen,
      '値を問い合わせの文字列に埋めると、名前に引用符が混ざったときに GraphQL の構文が壊れる',
    ).toContain('owner=hiroiku');
    expect(seen).toContain('name=glasshive');
  });

  it('最初のページでは続きの位置を渡さない', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssuePage(request);

    expect(
      seen.some((arg) => arg.startsWith('cursor=')),
      '空の続きの位置を送ると、GitHub は「そこから先」を 0 件と答える',
    ).toBe(false);
  });

  it('2 ページ目からは続きの位置を渡す', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssuePage({ ...request, cursor: 'Y3Vyc29y' });

    expect(seen).toContain('cursor=Y3Vyc29y');
  });

  it('応答をそのまま持ち帰る', async () => {
    const tracker = createGhIssueTrackerIntegration({ run: async () => '{"data":{}}' });
    const answer = await tracker.fetchIssuePage(request);
    expect(answer.kind === 'observed' && answer.value).toBe('{"data":{}}');
  });

  it.each([
    ['ENOENT', 'tracker.not_installed'],
    ['EACCES', 'tracker.denied'],
    ['ETIMEDOUT', 'tracker.timeout'],
  ])('%s を %s として言い分ける', async (errno, code) => {
    const tracker = createGhIssueTrackerIntegration({
      run: async () => {
        throw errnoError(errno);
      },
    });

    const answer = await tracker.fetchIssuePage(request);

    expect(
      answer.kind === 'unobservable' && answer.error.code,
      '同じコードに潰すと、gh を入れる話と入り直す話を画面が言い分けられない',
    ).toBe(code);
  });

  it('非ゼロ終了の stderr を捨てない', async () => {
    const tracker = createGhIssueTrackerIntegration({
      run: async () => {
        throw exitError(1, 'gh: To get started with GitHub CLI, please run: gh auth login');
      },
    });

    const answer = await tracker.fetchIssuePage(request);

    expect(answer.kind === 'unobservable' && answer.error.code).toBe('tracker.exit_nonzero');
    expect(
      answer.kind === 'unobservable' && answer.error.details?.stderr,
      'なぜ非ゼロだったのかは、ここにしか残らない',
    ).toContain('gh auth login');
  });

  it('説明の付かない落ち方で、gh のメッセージを外へ出さない', async () => {
    const tracker = createGhIssueTrackerIntegration({
      run: async () => {
        throw new Error('token ghp_secret is invalid');
      },
    });

    const answer = await tracker.fetchIssuePage(request);

    expect(answer.kind === 'unobservable' && answer.error.code).toBe('unexpected');
    expect(
      answer.kind === 'unobservable' && answer.error.message,
      '投げられたメッセージは、そのまま外部 API の message に載る',
    ).not.toContain('ghp_secret');
  });
});

describe('gh に課題 1 件の本文を尋ねる', () => {
  const one = { owner: 'hiroiku', name: 'glasshive', number: 209 };

  it('番号も、問い合わせの文字列に埋めずに渡す', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssueBody(one);

    expect(seen.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(seen).toContain('owner=hiroiku');
    expect(seen).toContain('name=glasshive');
    expect(seen).toContain('number=209');
  });

  it('求めるのは本文だけにする', async () => {
    let query = '';
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        query = args.find((arg) => arg.startsWith('query=')) ?? '';
        return '{}';
      },
    });

    await tracker.fetchIssueBody(one);

    expect(query).toContain('body');
    expect(
      query,
      'ここが一覧の欄まで採り直すと、同じものを 2 度運んでどちらが新しいかを決める仕事が増える',
    ).not.toContain('labels');
    expect(
      query,
      'こちらは Markdown を自分で描いている。他所で組まれた HTML を差し込むことはしない',
    ).not.toContain('bodyHTML');
  });

  it('落ちた理由は一覧のときと同じに分ける', async () => {
    const tracker = createGhIssueTrackerIntegration({
      run: async () => {
        throw errnoError('ENOENT');
      },
    });

    const answer = await tracker.fetchIssueBody(one);

    expect(answer.kind === 'unobservable' && answer.error.code).toBe('tracker.not_installed');
  });
});

describe('gh に課題 1 件のやり取りを尋ねる', () => {
  const one = { owner: 'hiroiku', name: 'glasshive', number: 13, cursor: null };

  /** 渡した引数のうち、問い合わせの文字列だけを取り出す */
  const queryOf = (args: readonly string[]): string =>
    args.find((arg) => arg.startsWith('query=')) ?? '';

  it('owner も名前も番号も、問い合わせの文字列に埋めずに渡す', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssueDiscussion(one);

    expect(seen.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(seen).toContain('owner=hiroiku');
    expect(seen).toContain('name=glasshive');
    expect(seen).toContain('number=13');
  });

  it('最初のページでは続きの位置を渡さない', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssueDiscussion(one);

    expect(
      seen.some((arg) => arg.startsWith('cursor=')),
      '空の続きの位置を送ると、GitHub は「そこから先」を 0 件と答える',
    ).toBe(false);
  });

  it('2 ページ目からは続きの位置を渡す', async () => {
    let seen: readonly string[] = [];
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        seen = args;
        return '{}';
      },
    });

    await tracker.fetchIssueDiscussion({ ...one, cursor: 'Y3Vyc29y' });

    expect(seen).toContain('cursor=Y3Vyc29y');
  });

  it('読む種類だけを名指しで求める', async () => {
    let query = '';
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        query = queryOf(args);
        return '{}';
      },
    });

    await tracker.fetchIssueDiscussion(one);

    expect(query).toContain('itemTypes:');
    for (const type of ['ISSUE_COMMENT', 'CLOSED_EVENT', 'RENAMED_TITLE_EVENT']) {
      expect(query).toContain(type);
    }
    expect(
      query,
      '購読まで並ぶと、画面に何も足さない項目で 1 ページ 100 件の枠が埋まる',
    ).not.toContain('SUBSCRIBED_EVENT');
  });

  it('introspection で確かめた欄の名前で求める', async () => {
    let query = '';
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        query = queryOf(args);
        return '{}';
      },
    });

    await tracker.fetchIssueDiscussion(one);

    expect(query).toContain('blockingIssue');
    expect(query, 'BlockedByAddedEvent が持つのは blockingIssue である').not.toContain(
      'blockedByIssue',
    );
    expect(query).toContain('milestoneTitle');
    expect(query).toContain('canonical');
    expect(query).toContain('willCloseTarget');
  });

  it('総数は求めない', async () => {
    let query = '';
    const tracker = createGhIssueTrackerIntegration({
      run: async (args) => {
        query = queryOf(args);
        return '{}';
      },
    });

    await tracker.fetchIssueDiscussion(one);

    expect(
      query,
      'GitHub の総数はこちらが読み飛ばす種類まで数えているので、entries の数と引き比べると起きていない切り捨てを報せることになる',
    ).not.toContain('totalCount');
  });

  it('応答をそのまま持ち帰る', async () => {
    const tracker = createGhIssueTrackerIntegration({ run: async () => '{"data":{}}' });
    const answer = await tracker.fetchIssueDiscussion(one);
    expect(answer.kind === 'observed' && answer.value).toBe('{"data":{}}');
  });

  it('落ちた理由は一覧のときと同じに分ける', async () => {
    const tracker = createGhIssueTrackerIntegration({
      run: async () => {
        throw exitError(1, 'gh: To get started with GitHub CLI, please run: gh auth login');
      },
    });

    const answer = await tracker.fetchIssueDiscussion(one);

    expect(answer.kind === 'unobservable' && answer.error.code).toBe('tracker.exit_nonzero');
    expect(answer.kind === 'unobservable' && answer.error.details?.repository).toBe(
      'hiroiku/glasshive',
    );
  });
});
