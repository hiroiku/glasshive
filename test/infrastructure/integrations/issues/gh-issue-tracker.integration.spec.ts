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
